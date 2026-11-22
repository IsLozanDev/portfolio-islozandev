import { ConflictError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { Consentimiento, type Decision, type Finalidad } from '../src/domain/consentimiento.js';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { VersionTextoDuplicadaError } from '../src/domain/errores.js';
import { Persona } from '../src/domain/persona.js';
import { TextoFinalidad } from '../src/domain/texto-finalidad.js';
import { RepositorioConsentimientosTypeOrm } from '../src/infrastructure/typeorm/consentimientos.repositorio.js';
import { ENTIDADES_PER } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioPersonasTypeOrm } from '../src/infrastructure/typeorm/personas.repositorio.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const PRIMER_DNI = 47_000_000;
const TEXTO_LEGAL = 'Autorizo el tratamiento de mis datos para esta finalidad.';
const OPERADOR = uuidV7();
const MARZO = new Date('2026-03-01T15:00:00Z');
const NOVIEMBRE = new Date('2026-11-01T15:00:00Z');

describeConDb('Consentimientos con TypeORM (TR-RF-043, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let personas: RepositorioPersonasTypeOrm;
  let repositorio: RepositorioConsentimientosTypeOrm;
  let siguienteDni = PRIMER_DNI;
  const tenantA = uuidV7();
  const tenantB = uuidV7();

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(trabajo));

  async function personaGuardada(tenantId = tenantA): Promise<string> {
    siguienteDni += 1;
    const persona = Persona.registrar({
      id: uuidV7(),
      tenantId,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.crear('DNI', String(siguienteDni)),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      contactos: [Contacto.crear({ id: uuidV7(), tipo: 'CELULAR', valor: '987654321', principal: true })],
    });
    await enTenant(tenantId, () => personas.guardar(persona));
    return persona.id;
  }

  const texto = (finalidad: Finalidad, version: string, publicadoEn: Date) =>
    TextoFinalidad.publicar({ id: uuidV7(), finalidad, version, texto: TEXTO_LEGAL, publicadoPor: OPERADOR, publicadoEn });

  const publicar = (tenantId: string, ...textos: TextoFinalidad[]) =>
    enTenant(tenantId, async () => {
      for (const nuevo of textos) await repositorio.publicarTexto(nuevo);
    });

  const decision = (personaId: string, finalidad: Finalidad, decisionTomada: Decision, versionTexto: string) =>
    Consentimiento.crear({
      id: uuidV7(),
      personaId,
      finalidad,
      decision: decisionTomada,
      versionTexto,
      canal: 'PRESENCIAL',
      accionExpresa: true,
      evidenciaArchivoId: null,
      registradoPor: OPERADOR,
      registradoEn: new Date(),
    });

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_PER });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    personas = new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto);
    repositorio = new RepositorioConsentimientosTypeOrm(unidadDeTrabajo, contexto);
    await publicar(
      tenantA,
      texto('PROMOCIONES', '2026-03', MARZO),
      texto('PROMOCIONES', '2026-11', NOVIEMBRE),
      texto('PRESTACION', 'v1', MARZO),
    );
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('textosVigentes devuelve uno por finalidad, el más reciente, y el historial de una finalidad los dos', async () => {
    const vigentes = await enTenant(tenantA, () => repositorio.textosVigentes());
    const historial = await enTenant(tenantA, () => repositorio.historialTextos('PROMOCIONES'));

    expect(vigentes.map((vigente) => [vigente.finalidad, vigente.version, vigente.datos.texto])).toEqual([
      ['PRESTACION', 'v1', TEXTO_LEGAL],
      ['PROMOCIONES', '2026-11', TEXTO_LEGAL],
    ]);
    expect(historial.map((publicado) => publicado.version)).toEqual(['2026-11', '2026-03']);
  });

  it('uq_texto_finalidad_version: publicar una versión repetida → VersionTextoDuplicadaError', async () => {
    await expect(publicar(tenantA, texto('PROMOCIONES', '2026-11', new Date()))).rejects.toThrow(VersionTextoDuplicadaError);
  });

  it('guarda decisiones, revoca y lee el historial de la más reciente a la más antigua', async () => {
    const personaId = await personaGuardada();
    const aceptada = decision(personaId, 'PROMOCIONES', 'ACEPTA', '2026-11');
    await enTenant(tenantA, () => repositorio.guardar([aceptada, decision(personaId, 'PRESTACION', 'ACEPTA', 'v1')], []));

    const revocada = aceptada.revocar(OPERADOR, 'WHATSAPP', new Date());
    const rechazo = decision(personaId, 'PROMOCIONES', 'RECHAZA', '2026-11');
    await enTenant(tenantA, () => repositorio.guardar([rechazo], [revocada]));

    const historial = await enTenant(tenantA, () => repositorio.decisionesDe(personaId));
    expect(historial).toHaveLength(3);
    expect(historial[0].id).toBe(rechazo.id);
    expect(historial.find((leida) => leida.id === aceptada.id)?.revocacion).toEqual(
      expect.objectContaining({ revocadoPor: OPERADOR, canal: 'WHATSAPP' }),
    );
  });

  it('revocar una decisión ya revocada → ConflictError, sin cambiar la fila', async () => {
    const personaId = await personaGuardada();
    const aceptada = decision(personaId, 'PRESTACION', 'ACEPTA', 'v1');
    await enTenant(tenantA, () => repositorio.guardar([aceptada], []));
    await enTenant(tenantA, () => repositorio.guardar([], [aceptada.revocar(OPERADOR, 'WEB', new Date())]));

    await expect(enTenant(tenantA, () => repositorio.guardar([], [aceptada.revocar(OPERADOR, 'KIOSCO', new Date())]))).rejects.toThrow(
      ConflictError,
    );
    const [leida] = await enTenant(tenantA, () => repositorio.decisionesDe(personaId));
    expect(leida.revocacion?.canal).toBe('WEB');
  });

  it('ux_consentimiento_aceptado_vigente: un segundo ACEPTA vigente → ConflictError y no se guarda nada del lote', async () => {
    const personaId = await personaGuardada();
    await enTenant(tenantA, () => repositorio.guardar([decision(personaId, 'PROMOCIONES', 'ACEPTA', '2026-11')], []));

    const lote = [decision(personaId, 'PRESTACION', 'ACEPTA', 'v1'), decision(personaId, 'PROMOCIONES', 'ACEPTA', '2026-11')];
    await expect(enTenant(tenantA, () => repositorio.guardar(lote, []))).rejects.toThrow(ConflictError);
    expect(await enTenant(tenantA, () => repositorio.decisionesDe(personaId))).toHaveLength(1);
  });

  it('aislamiento: B no ve textos ni decisiones de A', async () => {
    const personaId = await personaGuardada();
    await enTenant(tenantA, () => repositorio.guardar([decision(personaId, 'PRESTACION', 'ACEPTA', 'v1')], []));

    expect(await enTenant(tenantB, () => repositorio.textosVigentes())).toEqual([]);
    expect(await enTenant(tenantB, () => repositorio.historialTextos('PROMOCIONES'))).toEqual([]);
    expect(await enTenant(tenantB, () => repositorio.decisionesDe(personaId))).toEqual([]);
  });
});
