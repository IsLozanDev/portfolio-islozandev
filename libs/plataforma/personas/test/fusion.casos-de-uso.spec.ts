import { ActualizarDatosBasicos } from '../src/application/actualizar-datos-basicos.js';
import { AgregarContacto } from '../src/application/agregar-contacto.js';
import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from '../src/application/buscar-persona.js';
import { ConsultarConsentimientos } from '../src/application/consentimientos/consultar-consentimientos.js';
import { PublicarTextoFinalidad } from '../src/application/consentimientos/publicar-texto-finalidad.js';
import { RegistrarConsentimientos } from '../src/application/consentimientos/registrar-consentimientos.js';
import { CompararPar } from '../src/application/duplicados/comparar-par.js';
import { DescartarPar } from '../src/application/duplicados/descartar-par.js';
import { FusionarPersonas, type FusionarPersonasComando } from '../src/application/duplicados/fusionar-personas.js';
import { ListarDuplicados } from '../src/application/duplicados/listar-duplicados.js';
import { QuitarDescarte } from '../src/application/duplicados/quitar-descarte.js';
import { ObtenerPersona } from '../src/application/obtener-persona.js';
import type { PersonaDetalle, RegistrarPersonaComando } from '../src/application/ports/persona.port.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { ParPersonas, PUNTAJE_MINIMO } from '../src/domain/duplicados.js';
import { crearDobles, TENANT_B, USUARIO_DEL_CONTEXTO, type Dobles } from './support/dobles.js';

const JUANA_DNI: RegistrarPersonaComando = {
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  celular: '987654321',
};
const JUANA_PASAPORTE: RegistrarPersonaComando = { ...JUANA_DNI, tipoDocumento: 'PASAPORTE', numeroDocumento: 'P1234567', apellidoMaterno: null, correo: 'juana@correo.pe' };
const JUANA_CE: RegistrarPersonaComando = { ...JUANA_DNI, tipoDocumento: 'CE', numeroDocumento: '009876543', apellidoMaterno: null };
const OTRO_DNI: RegistrarPersonaComando = { ...JUANA_DNI, numeroDocumento: '45781237' };
const MOTIVO = 'Misma clienta registrada con pasaporte';

describe('Casos de uso de duplicados y fusión (TR-RF-042)', () => {
  let dobles: Dobles;
  let registrar: RegistrarPersona;
  let fusionar: FusionarPersonas;
  let obtener: ObtenerPersona;

  const comando = (conservada: PersonaDetalle, absorbida: PersonaDetalle, extra: Partial<FusionarPersonasComando> = {}): FusionarPersonasComando => ({
    conservadaId: conservada.id,
    absorbidaId: absorbida.id,
    versionConservada: conservada.version,
    versionAbsorbida: absorbida.version,
    camposElegidos: { datosBasicos: {}, principales: {} },
    motivo: MOTIVO,
    ...extra,
  });

  /** Sin escrituras, auditoría ni eventos más allá de los registros previos. */
  function expectSinCambios(eventosAntes: number): void {
    expect(dobles.personas.fusionesGuardadas).toEqual([]);
    expect(dobles.fusiones.fusiones).toEqual([]);
    expect(dobles.auditoria.entradas).toEqual([]);
    expect(dobles.publicador.eventos).toHaveLength(eventosAntes);
  }

  beforeEach(() => {
    dobles = crearDobles();
    registrar = new RegistrarPersona(dobles);
    fusionar = new FusionarPersonas(dobles);
    obtener = new ObtenerPersona(dobles);
  });

  describe('FusionarPersonas', () => {
    it('TR-CA-107: una ficha con los contactos de ambas, la otra como alias, registro, auditoría y persona.fusionada', async () => {
      const conservada = await registrar.ejecutar(JUANA_DNI);
      const absorbida = await registrar.ejecutar(JUANA_PASAPORTE);

      const resultado = await fusionar.ejecutar(comando(conservada, absorbida));

      expect(resultado).toMatchObject({ id: conservada.id, numeroDocumento: '45781236', alias: [absorbida.id], resueltaDesde: null });
      expect(resultado.contactos.map(({ tipo, valor, principal }) => [tipo, valor, principal])).toEqual([
        ['CELULAR', '987654321', true],
        ['CORREO', 'juana@correo.pe', true],
      ]);
      const [guardada] = dobles.personas.fusionesGuardadas;
      expect(guardada).toMatchObject({ conservadaId: conservada.id, absorbidaId: absorbida.id });
      expect(guardada?.movimientos.contactosMovidos).toHaveLength(1);
      expect(dobles.fusiones.fusiones).toEqual([
        expect.objectContaining({ conservadaId: conservada.id, absorbidaId: absorbida.id, motivo: MOTIVO, fusionadoPor: USUARIO_DEL_CONTEXTO }),
      ]);
      const evento = dobles.publicador.eventos.at(-1);
      expect(evento).toMatchObject({
        eventType: 'persona.fusionada',
        aggregateId: conservada.id,
        payload: { persona_conservada_id: conservada.id, persona_absorbida_id: absorbida.id, fusion_id: dobles.fusiones.fusiones[0]?.id },
      });
    });

    it('audita antes y después con motivo, el documento enmascarado y sin valores de contactos', async () => {
      const conservada = await registrar.ejecutar(JUANA_DNI);
      const absorbida = await registrar.ejecutar(JUANA_PASAPORTE);

      await fusionar.ejecutar(comando(conservada, absorbida, { motivo: `  ${MOTIVO}  ` }));

      const [entrada] = dobles.auditoria.entradas;
      expect(entrada).toMatchObject({
        accion: 'plat.persona.fusionar',
        entidadTipo: 'persona',
        entidadId: conservada.id,
        motivo: MOTIVO,
        antes: { conservada: { numero_documento: '****1236' }, absorbida: { numero_documento: '****4567' } },
        despues: { absorbida_id: absorbida.id, fusionada_en_id: conservada.id },
      });
      const texto = JSON.stringify(entrada);
      for (const dato of ['45781236', 'P1234567', '987654321', 'juana@correo.pe']) expect(texto).not.toContain(dato);
    });

    it('TR-CA-108: DNI distintos → DOCUMENTOS_DISTINTOS sin guardar, auditar ni publicar', async () => {
      const conservada = await registrar.ejecutar(JUANA_DNI);
      const otra = await registrar.ejecutar(OTRO_DNI);
      const eventosAntes = dobles.publicador.eventos.length;

      await expect(fusionar.ejecutar(comando(conservada, otra))).rejects.toMatchObject({
        code: 'DOCUMENTOS_DISTINTOS',
        message: 'Las personas tienen documentos distintos',
      });
      expectSinCambios(eventosAntes);
    });

    it('motivo inválido, versión distinta, misma persona y principal ajeno no guardan nada', async () => {
      const conservada = await registrar.ejecutar(JUANA_DNI);
      const absorbida = await registrar.ejecutar(JUANA_PASAPORTE);
      const eventosAntes = dobles.publicador.eventos.length;

      await expect(fusionar.ejecutar(comando(conservada, absorbida, { motivo: 'abcd' }))).rejects.toMatchObject({ code: 'MOTIVO_INVALIDO' });
      await expect(fusionar.ejecutar(comando(conservada, absorbida, { versionAbsorbida: 9 }))).rejects.toMatchObject({ code: 'VERSION_OBSOLETA' });
      await expect(fusionar.ejecutar(comando(conservada, conservada))).rejects.toMatchObject({ code: 'MISMA_PERSONA' });
      await expect(
        fusionar.ejecutar(comando(conservada, absorbida, { camposElegidos: { datosBasicos: {}, principales: { CELULAR: conservada.id } } })),
      ).rejects.toMatchObject({ code: 'CAMPO_ELEGIDO_INVALIDO' });
      expectSinCambios(eventosAntes);
    });

    it('una absorbida no se vuelve a fusionar ni sirve de conservada', async () => {
      const conservada = await registrar.ejecutar(JUANA_DNI);
      const absorbida = await registrar.ejecutar(JUANA_PASAPORTE);
      const otra = await registrar.ejecutar(JUANA_CE);
      await fusionar.ejecutar(comando(conservada, absorbida));
      const versionAlias = dobles.personas.guardadas.find((persona) => persona.id === absorbida.id)?.version ?? 0;

      await expect(fusionar.ejecutar(comando(otra, { ...absorbida, version: versionAlias }))).rejects.toMatchObject({
        code: 'PERSONA_FUSIONADA',
        conservadaId: conservada.id,
      });
      await expect(fusionar.ejecutar(comando({ ...absorbida, version: versionAlias }, otra))).rejects.toMatchObject({ code: 'PERSONA_FUSIONADA' });
    });

    it('si la conservada se absorbe después en otra, sus alias pasan a la nueva y leerlos la devuelve', async () => {
      const primera = await registrar.ejecutar(JUANA_PASAPORTE);
      const segunda = await registrar.ejecutar(JUANA_CE);
      const tercera = await registrar.ejecutar(JUANA_DNI);
      await fusionar.ejecutar(comando(segunda, primera));
      const segundaActual = await obtener.ejecutar(segunda.id);

      const resultado = await fusionar.ejecutar(comando(tercera, segundaActual));

      expect([...resultado.alias].sort()).toEqual([primera.id, segunda.id].sort());
      expect(await obtener.ejecutar(primera.id)).toMatchObject({ id: tercera.id, resueltaDesde: primera.id });
    });
  });

  describe('alias en lecturas y escrituras', () => {
    let conservada: PersonaDetalle;
    let absorbida: PersonaDetalle;

    beforeEach(async () => {
      conservada = await registrar.ejecutar(JUANA_DNI);
      absorbida = await registrar.ejecutar(JUANA_PASAPORTE);
      await fusionar.ejecutar(comando(conservada, absorbida));
    });

    it('obtener y buscar por documento de la absorbida devuelven la conservada', async () => {
      expect(await obtener.ejecutar(absorbida.id)).toMatchObject({ id: conservada.id, resueltaDesde: absorbida.id, alias: [absorbida.id] });
      const busqueda = await new BuscarPersonaPorDocumento(dobles).ejecutar({ tipo: 'PASAPORTE', numero: 'P1234567', puedePrellenar: false });
      expect(busqueda).toMatchObject({ encontrada: true, persona: { id: conservada.id } });
    });

    it('registrar el documento de la absorbida → PERSONA_DUPLICADA con la conservada', async () => {
      await expect(registrar.ejecutar(JUANA_PASAPORTE)).rejects.toMatchObject({ code: 'PERSONA_DUPLICADA', personaId: conservada.id });
    });

    it('editar, agregar contactos y asignar rol sobre la absorbida → PERSONA_FUSIONADA con la conservada', async () => {
      const esperado = { code: 'PERSONA_FUSIONADA', conservadaId: conservada.id };
      await expect(new ActualizarDatosBasicos(dobles).ejecutar({ personaId: absorbida.id, version: 99, nombres: 'Rosa' })).rejects.toMatchObject(esperado);
      await expect(new AgregarContacto(dobles).ejecutar({ personaId: absorbida.id, tipo: 'FIJO', valor: '054234567' })).rejects.toMatchObject(esperado);
      await expect(new AsignarRolPersona(dobles).ejecutar({ personaId: absorbida.id, productoCodigo: 'CLI', rol: 'PACIENTE' })).rejects.toMatchObject(esperado);
    });
  });

  describe('consentimientos de la absorbida', () => {
    it('se quedan en ella, salen en el historial de la conservada y no cuentan como vigentes; consentir sobre la absorbida → PERSONA_FUSIONADA', async () => {
      const conservada = await registrar.ejecutar(JUANA_DNI);
      const absorbida = await registrar.ejecutar(JUANA_PASAPORTE);
      await new PublicarTextoFinalidad(dobles).ejecutar({ finalidad: 'PROMOCIONES', version: 'v1', texto: 'Acepto recibir promociones por correo.' });
      const consentir = new RegistrarConsentimientos(dobles);
      const lote = (personaId: string) => ({
        personaId,
        canal: 'WEB' as const,
        decisiones: [{ finalidad: 'PROMOCIONES' as const, decision: 'ACEPTA' as const, versionTexto: 'v1', accionExpresa: true }],
      });
      await consentir.ejecutar(lote(absorbida.id));
      await fusionar.ejecutar(comando(conservada, absorbida));

      const consultar = new ConsultarConsentimientos(dobles);
      expect((await consultar.historial(conservada.id)).map((decision) => decision.personaId)).toEqual([absorbida.id]);
      expect(await consultar.vigente(conservada.id, 'PROMOCIONES')).toBeNull();
      await expect(consentir.ejecutar(lote(absorbida.id))).rejects.toMatchObject({ code: 'PERSONA_FUSIONADA' });
    });
  });

  describe('lista, comparación y descartes', () => {
    it('ListarDuplicados pide desde el puntaje mínimo', async () => {
      await new ListarDuplicados(dobles).ejecutar({ pagina: 2, tamano: 10 });
      expect(dobles.consultaDuplicados.criterios).toEqual([{ pagina: 2, tamano: 10, puntajeMinimo: PUNTAJE_MINIMO }]);
    });

    it('CompararPar trae las dos fichas en orden con puntaje, descarte y bloqueo', async () => {
      const juana = await registrar.ejecutar(JUANA_DNI);
      const otra = await registrar.ejecutar(OTRO_DNI);
      dobles.consultaDuplicados.evaluacion = { puntaje: 80, motivos: ['CELULAR_Y_NOMBRE_IGUAL'] };
      const par = ParPersonas.de(juana.id, otra.id);

      const comparacion = await new CompararPar(dobles).ejecutar(otra.id, juana.id);

      expect(comparacion).toMatchObject({
        personaA: { id: par.menor, version: 1 },
        personaB: { id: par.mayor },
        puntaje: 80,
        motivos: ['CELULAR_Y_NOMBRE_IGUAL'],
        descartado: false,
        bloqueo: 'DOCUMENTOS_DISTINTOS',
      });
      dobles.consultaDuplicados.evaluacion = null;
      expect(await new CompararPar(dobles).ejecutar(juana.id, otra.id)).toMatchObject({ puntaje: 0, motivos: [] });
    });

    it('descartar es idempotente y auditado; quitar lo devuelve; quitar uno inexistente → DESCARTE_NO_ENCONTRADO', async () => {
      const juana = await registrar.ejecutar(JUANA_DNI);
      const otra = await registrar.ejecutar(OTRO_DNI);
      const par = ParPersonas.de(juana.id, otra.id);

      await new DescartarPar(dobles).ejecutar(juana.id, otra.id);
      await new DescartarPar(dobles).ejecutar(otra.id, juana.id);
      expect(await dobles.fusiones.estaDescartado(par)).toBe(true);
      expect(await new CompararPar(dobles).ejecutar(juana.id, otra.id)).toMatchObject({ descartado: true });

      await new QuitarDescarte(dobles).ejecutar(otra.id, juana.id);
      expect(await dobles.fusiones.estaDescartado(par)).toBe(false);
      await expect(new QuitarDescarte(dobles).ejecutar(juana.id, otra.id)).rejects.toMatchObject({ code: 'DESCARTE_NO_ENCONTRADO' });
      expect(dobles.auditoria.entradas.map((entrada) => entrada.accion)).toEqual([
        'plat.persona.duplicado.descartar',
        'plat.persona.duplicado.descartar',
        'plat.persona.duplicado.quitar_descarte',
      ]);
    });

    it('una persona de otro tenant no existe para comparar, descartar ni fusionar', async () => {
      const juana = await registrar.ejecutar(JUANA_DNI);
      const ajena = await dobles.contexto.run({ tenantId: TENANT_B, actorId: USUARIO_DEL_CONTEXTO }, () => registrar.ejecutar(JUANA_PASAPORTE));

      await expect(new CompararPar(dobles).ejecutar(juana.id, ajena.id)).rejects.toMatchObject({ code: 'NO_ENCONTRADA' });
      await expect(new DescartarPar(dobles).ejecutar(juana.id, ajena.id)).rejects.toMatchObject({ code: 'NO_ENCONTRADA' });
      await expect(fusionar.ejecutar(comando(juana, ajena))).rejects.toMatchObject({ code: 'NO_ENCONTRADA' });
    });
  });
});
