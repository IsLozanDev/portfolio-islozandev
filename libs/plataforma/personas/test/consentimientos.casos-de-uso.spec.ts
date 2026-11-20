import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import { ConsultarConsentimientos } from '../src/application/consentimientos/consultar-consentimientos.js';
import { ConsultarTextos } from '../src/application/consentimientos/consultar-textos.js';
import { PublicarTextoFinalidad } from '../src/application/consentimientos/publicar-texto-finalidad.js';
import { RegistrarConsentimientos } from '../src/application/consentimientos/registrar-consentimientos.js';
import { RevocarConsentimiento } from '../src/application/consentimientos/revocar-consentimiento.js';
import { ServicioConsentimientos } from '../src/application/consentimientos/servicio-consentimientos.js';
import type { DecisionComando } from '../src/application/ports/consentimiento.port.js';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { PersonaNoEncontradaError } from '../src/domain/errores.js';
import { Persona } from '../src/domain/persona.js';
import { registrarEsquemasPer } from '../src/infrastructure/event-schemas.js';
import { AHORA, crearDobles, TENANT_A, TENANT_B, USUARIO_DEL_CONTEXTO, type Dobles } from './support/dobles.js';

const PERSONA = '37000000-0000-4000-8000-0000000000a1';
const EVIDENCIA = '37000000-0000-4000-8000-0000000000f1';
const TEXTO_PROMOCIONES = 'Acepto recibir promociones por WhatsApp y correo electrónico.';
const TEXTO_PRESTACION = 'Autorizo el tratamiento de mis datos para la prestación del servicio.';

const UN_DIA_MS = 86_400_000;
const DESPUES = new Date(AHORA.getTime() + UN_DIA_MS);

const decision = (finalidad: DecisionComando['finalidad'], tomada: DecisionComando['decision'], versionTexto: string): DecisionComando => ({
  finalidad,
  decision: tomada,
  versionTexto,
  accionExpresa: true,
});

describe('Casos de uso de consentimientos (TR-RF-043)', () => {
  let dobles: Dobles;
  let servicio: ServicioConsentimientos;
  let publicarTexto: PublicarTextoFinalidad;
  let consultarTextos: ConsultarTextos;
  let consultar: ConsultarConsentimientos;

  async function registrarPersona(tenantId = TENANT_A): Promise<void> {
    const persona = Persona.registrar({
      id: PERSONA,
      tenantId,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.crear('DNI', '45781236'),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      contactos: [Contacto.crear({ id: 'celular', tipo: 'CELULAR', valor: '987654321', principal: true })],
    });
    persona.pullEvents();
    await dobles.personas.guardar(persona);
  }

  beforeEach(async () => {
    dobles = crearDobles();
    const registrar = new RegistrarConsentimientos(dobles);
    consultar = new ConsultarConsentimientos(dobles);
    consultarTextos = new ConsultarTextos(dobles);
    publicarTexto = new PublicarTextoFinalidad(dobles);
    servicio = new ServicioConsentimientos({ consultarConsentimientos: consultar, consultarTextos, registrar, revocar: new RevocarConsentimiento(dobles) });
    await registrarPersona();
    await publicarTexto.ejecutar({ finalidad: 'PROMOCIONES', version: '2026-03', texto: TEXTO_PROMOCIONES });
    await publicarTexto.ejecutar({ finalidad: 'PRESTACION', version: 'v1', texto: TEXTO_PRESTACION });
    dobles.auditoria.entradas.length = 0;
  });

  it('TR-CA-109: registra el lote, audita sin el texto y la consulta muestra PRESTACION vigente y PROMOCIONES rechazada', async () => {
    const registradas = await servicio.registrar({
      personaId: PERSONA,
      canal: 'PRESENCIAL',
      decisiones: [decision('PRESTACION', 'ACEPTA', 'v1'), decision('PROMOCIONES', 'RECHAZA', '2026-03')],
    });

    expect(registradas.map(({ finalidad, decision: tomada, versionTexto, canal, registradoPor, registradoEn }) => [finalidad, tomada, versionTexto, canal, registradoPor, registradoEn])).toEqual([
      ['PRESTACION', 'ACEPTA', 'v1', 'PRESENCIAL', USUARIO_DEL_CONTEXTO, AHORA],
      ['PROMOCIONES', 'RECHAZA', '2026-03', 'PRESENCIAL', USUARIO_DEL_CONTEXTO, AHORA],
    ]);
    expect(dobles.auditoria.entradas).toEqual([
      {
        accion: 'plat.persona.consentimiento.registrar',
        entidadTipo: 'persona',
        entidadId: PERSONA,
        despues: {
          canal: 'PRESENCIAL',
          evidencia_archivo_id: null,
          decisiones: [
            { finalidad: 'PRESTACION', decision: 'ACEPTA', version_texto: 'v1' },
            { finalidad: 'PROMOCIONES', decision: 'RECHAZA', version_texto: '2026-03' },
          ],
        },
      },
    ]);
    expect(dobles.publicador.eventos).toEqual([]);

    const vigentes = await consultar.vigentes(PERSONA);
    expect(vigentes.map(({ finalidad, decision: vigente }) => [finalidad, vigente?.decision ?? null])).toEqual([
      ['PRESTACION', 'ACEPTA'],
      ['PROMOCIONES', 'RECHAZA'],
      ['COMPARTIR_PRODUCTOS', null],
      ['DATOS_SALUD', null],
      ['IDENTIDAD_PORTABLE', null],
    ]);
  });

  it('TR-CA-110: revocar PROMOCIONES publica consentimiento.revocado con su esquema y vigente devuelve null', async () => {
    await servicio.registrar({ personaId: PERSONA, canal: 'WEB', decisiones: [decision('PROMOCIONES', 'ACEPTA', '2026-03')] });
    dobles.auditoria.entradas.length = 0;

    const revocada = await servicio.revocar(PERSONA, 'PROMOCIONES', 'WHATSAPP');

    expect(revocada).toMatchObject({ revocadoEn: AHORA, revocadoPor: USUARIO_DEL_CONTEXTO, canalRevocacion: 'WHATSAPP' });
    expect(await servicio.vigente(PERSONA, 'PROMOCIONES')).toBeNull();
    const [evento] = dobles.publicador.eventos;
    expect(dobles.publicador.tipos()).toEqual(['consentimiento.revocado']);
    expect(evento).toMatchObject({ aggregateType: 'persona', aggregateId: PERSONA, schemaVersion: 1 });
    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasPer(validador);
    expect(() => validador.validate(evento)).not.toThrow();
    expect(dobles.auditoria.entradas).toEqual([]);
  });

  it('un RECHAZA sobre un ACEPTA vigente deja el anterior revocado, inserta el nuevo y publica consentimiento.revocado', async () => {
    await servicio.registrar({ personaId: PERSONA, canal: 'WEB', decisiones: [decision('PROMOCIONES', 'ACEPTA', '2026-03')] });

    dobles.reloj.actual = DESPUES;
    await servicio.registrar({ personaId: PERSONA, canal: 'KIOSCO', decisiones: [decision('PROMOCIONES', 'RECHAZA', '2026-03')] });

    const historial = await consultar.historial(PERSONA);
    expect(historial.map(({ decision: tomada, canalRevocacion }) => [tomada, canalRevocacion ?? null])).toEqual([
      ['RECHAZA', null],
      ['ACEPTA', 'KIOSCO'],
    ]);
    expect(dobles.publicador.eventos.map((evento) => evento.payload)).toEqual([
      { persona_id: PERSONA, finalidad: 'PROMOCIONES', version_texto: '2026-03', canal: 'KIOSCO', revocado_en: DESPUES.toISOString() },
    ]);
  });

  it('publicar una versión nueva del texto no cambia el vigente: devuelve la versión aceptada antes', async () => {
    await servicio.registrar({ personaId: PERSONA, canal: 'WEB', decisiones: [decision('PROMOCIONES', 'ACEPTA', '2026-03')] });
    dobles.reloj.actual = DESPUES;

    await publicarTexto.ejecutar({ finalidad: 'PROMOCIONES', version: '2026-11', texto: TEXTO_PROMOCIONES });

    expect(await servicio.vigente(PERSONA, 'PROMOCIONES')).toEqual({ finalidad: 'PROMOCIONES', versionTexto: '2026-03', canal: 'WEB', otorgadoEn: AHORA });
  });

  it('un lote inválido no guarda nada, no audita ni publica', async () => {
    const lote = [decision('PRESTACION', 'ACEPTA', 'v1'), { ...decision('PROMOCIONES', 'ACEPTA', '2026-03'), accionExpresa: false }];

    await expect(servicio.registrar({ personaId: PERSONA, canal: 'WEB', decisiones: lote })).rejects.toMatchObject({ code: 'ACCION_EXPRESA_REQUERIDA' });
    expect([await consultar.historial(PERSONA), dobles.auditoria.entradas, dobles.publicador.eventos]).toEqual([[], [], []]);
  });

  describe('evidencia (TR-ARC)', () => {
    const conEvidencia = () =>
      servicio.registrar({ personaId: PERSONA, canal: 'PRESENCIAL', evidenciaArchivoId: EVIDENCIA, decisiones: [decision('PRESTACION', 'ACEPTA', 'v1')] });

    it('de otro tenant o inexistente → EVIDENCIA_NO_ENCONTRADA', async () => {
      await expect(conEvidencia()).rejects.toMatchObject({ code: 'EVIDENCIA_NO_ENCONTRADA' });
    });

    it.each(['EN_ANALISIS', 'CUARENTENA'] as const)('en %s → EVIDENCIA_INVALIDA motivo NO_DISPONIBLE', async (estado) => {
      dobles.archivos.archivos.set(EVIDENCIA, { estado, categoria: 'EVIDENCIA' });

      await expect(conEvidencia()).rejects.toMatchObject({ code: 'EVIDENCIA_INVALIDA', motivo: 'NO_DISPONIBLE' });
    });

    it('de otra categoría → EVIDENCIA_INVALIDA motivo CATEGORIA', async () => {
      dobles.archivos.archivos.set(EVIDENCIA, { estado: 'DISPONIBLE', categoria: 'FOTO_PERFIL' });

      await expect(conEvidencia()).rejects.toMatchObject({ code: 'EVIDENCIA_INVALIDA', motivo: 'CATEGORIA' });
    });

    it('válida → queda en evidencia_archivo_id y en la auditoría; la consulta se hace fuera de la transacción', async () => {
      dobles.archivos.archivos.set(EVIDENCIA, { estado: 'DISPONIBLE', categoria: 'EVIDENCIA' });
      const consultarEstado = dobles.archivos.estado.bind(dobles.archivos);
      let transaccionesAlConsultar = -1;
      dobles.archivos.estado = (archivoId) => {
        transaccionesAlConsultar = dobles.unidadDeTrabajo.enCurso;
        return consultarEstado(archivoId);
      };

      const [registrada] = await conEvidencia();

      expect(registrada.evidenciaArchivoId).toBe(EVIDENCIA);
      expect(dobles.auditoria.entradas[0].despues).toMatchObject({ evidencia_archivo_id: EVIDENCIA });
      expect(transaccionesAlConsultar).toBe(0);
    });
  });

  it('persona de otro tenant → NO_ENCONTRADA al registrar, revocar y consultar', async () => {
    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO_DEL_CONTEXTO };

    await expect(servicio.registrar({ personaId: PERSONA, canal: 'WEB', decisiones: [decision('PRESTACION', 'ACEPTA', 'v1')] })).rejects.toThrow(
      PersonaNoEncontradaError,
    );
    await expect(servicio.revocar(PERSONA, 'PRESTACION', 'WEB')).rejects.toThrow(PersonaNoEncontradaError);
    await expect(servicio.vigente(PERSONA, 'PRESTACION')).rejects.toThrow(PersonaNoEncontradaError);
    expect(await servicio.textosVigentes()).toEqual([]);
  });

  it('publicar texto audita finalidad y versión sin el texto; textosVigentes da uno por finalidad, el más reciente', async () => {
    dobles.reloj.actual = DESPUES;
    await publicarTexto.ejecutar({ finalidad: 'PROMOCIONES', version: '2026-11', texto: TEXTO_PROMOCIONES });

    expect(dobles.auditoria.entradas).toEqual([
      { accion: 'plat.persona.texto_finalidad.publicar', entidadTipo: 'texto_finalidad', entidadId: expect.any(String), despues: { finalidad: 'PROMOCIONES', version: '2026-11' } },
    ]);
    expect(JSON.stringify(dobles.auditoria.entradas)).not.toContain(TEXTO_PROMOCIONES);
    expect((await servicio.textosVigentes()).map(({ finalidad, version }) => [finalidad, version])).toEqual([
      ['PRESTACION', 'v1'],
      ['PROMOCIONES', '2026-11'],
    ]);
    expect((await consultarTextos.historial('PROMOCIONES')).map(({ version }) => version)).toEqual(['2026-11', '2026-03']);
  });

  it('sin usuario en el contexto no registra ni publica', async () => {
    dobles.contexto.alcance = { tenantId: TENANT_A };

    await expect(publicarTexto.ejecutar({ finalidad: 'PROMOCIONES', version: 'v9', texto: TEXTO_PROMOCIONES })).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
  });
});
