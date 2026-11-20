import { ConflictError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { AsignarRolPersona } from '../src/application/asignar-rol.js';
import type { DependenciasPersonas } from '../src/application/dependencias-personas.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { PersonaDuplicadaError } from '../src/domain/errores.js';
import { Persona } from '../src/domain/persona.js';
import { registrarEsquemasPer } from '../src/infrastructure/event-schemas.js';
import { ENTIDADES_PER } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioPersonasTypeOrm } from '../src/infrastructure/typeorm/personas.repositorio.js';
import { VerificadorReferenciasPer } from '../src/infrastructure/verificador-referencias.per.js';
import { ArchivosFijos, AuditoriaEspia, CatalogoFijo, IdentidadEspia, SuscripcionesFijas } from './support/dobles.js';
import { RepositorioConsentimientosTypeOrm } from '../src/infrastructure/typeorm/consentimientos.repositorio.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const HOY = '2026-11-18';
const ITEM_ID = '31000000-0000-4000-8000-0000000000d1';

describeConDb('Personas con TypeORM (TR-RF-039, 040, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let repositorio: RepositorioPersonasTypeOrm;
  const tenantA = uuidV7();
  const tenantB = uuidV7();

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(trabajo));

  function juana(tenantId: string, numeroDni: string): Persona {
    return Persona.registrar({
      id: uuidV7(),
      tenantId,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.crear('DNI', numeroDni),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      contactos: [
        Contacto.crear({ id: uuidV7(), tipo: 'CELULAR', valor: '987654321', principal: true }),
        Contacto.crear({ id: uuidV7(), tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true }),
      ],
    });
  }

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_PER });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    repositorio = new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('guarda y lee una persona con sus contactos, por id y por documento', async () => {
    const persona = juana(tenantA, '45781236');
    await enTenant(tenantA, () => repositorio.guardar(persona));

    const porId = await enTenant(tenantA, () => repositorio.obtener(persona.id));
    const porDocumento = await enTenant(tenantA, () => repositorio.buscarPorDocumento('DNI', '45781236'));

    expect(porId).toMatchObject({
      id: persona.id,
      tenantId: tenantA,
      tipoPersona: 'NATURAL',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      razonSocial: null,
      activo: true,
      version: 1,
    });
    expect(porId?.documento).toMatchObject({ tipo: 'DNI', numero: '45781236' });
    expect(porId?.contactos.map(({ tipo, valor, principal }) => ({ tipo, valor, principal }))).toEqual(
      expect.arrayContaining([
        { tipo: 'CELULAR', valor: '987654321', principal: true },
        { tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true },
      ]),
    );
    expect(porId?.contactos).toHaveLength(2);
    expect(porDocumento?.id).toBe(persona.id);
  });

  it('TR-CA-103: guarda dos roles de productos distintos sobre una sola persona', async () => {
    const persona = juana(tenantA, '45781237');
    await enTenant(tenantA, () => repositorio.guardar(persona));

    await enTenant(tenantA, async () => {
      const leida = await repositorio.obtener(persona.id);
      leida?.asignarRol('CLI', 'PACIENTE', HOY);
      await repositorio.guardar(leida as Persona);
    });
    await enTenant(tenantA, async () => {
      const leida = await repositorio.obtener(persona.id);
      leida?.asignarRol('GYM', 'SOCIO', HOY);
      await repositorio.guardar(leida as Persona);
    });

    const final = await enTenant(tenantA, () => repositorio.obtener(persona.id));
    expect(final?.roles).toEqual([
      { productoCodigo: 'CLI', rol: 'PACIENTE', desde: HOY, hasta: null },
      { productoCodigo: 'GYM', rol: 'SOCIO', desde: HOY, hasta: null },
    ]);
    expect(final?.version).toBe(3);
    expect(final?.contactos).toHaveLength(2);
    const [{ personas }] = await dataSource.query(
      `SELECT count(*)::int AS personas FROM per.persona WHERE tenant_id = $1 AND numero_documento = '45781237'`,
      [tenantA],
    );
    expect(personas).toBe(1);
  });

  it('guardar sin cambios no toca la versión ni repite filas', async () => {
    const persona = juana(tenantA, '45781238');
    await enTenant(tenantA, () => repositorio.guardar(persona));

    await enTenant(tenantA, async () => {
      const leida = (await repositorio.obtener(persona.id)) as Persona;
      await repositorio.guardar(leida);
      await repositorio.guardar(leida);
    });

    const final = await enTenant(tenantA, () => repositorio.obtener(persona.id));
    expect(final?.version).toBe(1);
    expect(final?.contactos).toHaveLength(2);
  });

  it('aísla por tenant: B no ve a la persona de A y puede registrar el mismo documento', async () => {
    const deA = juana(tenantA, '45781239');
    await enTenant(tenantA, () => repositorio.guardar(deA));

    expect(await enTenant(tenantB, () => repositorio.obtener(deA.id))).toBeNull();
    expect(await enTenant(tenantB, () => repositorio.buscarPorDocumento('DNI', '45781239'))).toBeNull();

    const deB = juana(tenantB, '45781239');
    await enTenant(tenantB, () => repositorio.guardar(deB));
    expect((await enTenant(tenantB, () => repositorio.buscarPorDocumento('DNI', '45781239')))?.id).toBe(deB.id);
    expect((await enTenant(tenantA, () => repositorio.buscarPorDocumento('DNI', '45781239')))?.id).toBe(deA.id);
  });

  it('traduce el documento repetido a PersonaDuplicadaError con el id existente y no deja filas a medias', async () => {
    const primera = juana(tenantA, '45781240');
    await enTenant(tenantA, () => repositorio.guardar(primera));

    const repetida = juana(tenantA, '45781240');
    const guardarRepetida = enTenant(tenantA, () => repositorio.guardar(repetida));

    await expect(guardarRepetida).rejects.toBeInstanceOf(PersonaDuplicadaError);
    await expect(guardarRepetida).rejects.toMatchObject({ code: 'PERSONA_DUPLICADA', personaId: primera.id });
    const [{ contactos }] = await dataSource.query(`SELECT count(*)::int AS contactos FROM per.contacto WHERE persona_id = $1`, [
      repetida.id,
    ]);
    expect(contactos).toBe(0);
  });

  it('carrera de dos registros del mismo documento: gana el primero y el segundo recibe su id', async () => {
    const primera = juana(tenantA, '45781241');
    const segunda = juana(tenantA, '45781241');
    let confirmarPrimera = (): void => undefined;
    const primeraPuedeConfirmar = new Promise<void>((resolver) => (confirmarPrimera = resolver));
    let avisarInsertada = (): void => undefined;
    const primeraInsertada = new Promise<void>((resolver) => (avisarInsertada = resolver));

    const transaccionPrimera = enTenant(tenantA, async () => {
      await repositorio.guardar(primera);
      avisarInsertada();
      await primeraPuedeConfirmar;
    });
    await primeraInsertada;
    // Queda esperando el índice único hasta que la primera transacción confirme.
    const transaccionSegunda = enTenant(tenantA, () => repositorio.guardar(segunda));
    confirmarPrimera();

    await transaccionPrimera;
    await expect(transaccionSegunda).rejects.toMatchObject({ code: 'PERSONA_DUPLICADA', personaId: primera.id });
  });

  it('conflicto de versión: dos lecturas de la misma persona, la segunda escritura falla', async () => {
    const persona = juana(tenantA, '45781242');
    await enTenant(tenantA, () => repositorio.guardar(persona));
    const lecturaUno = (await enTenant(tenantA, () => repositorio.obtener(persona.id))) as Persona;
    const lecturaDos = (await enTenant(tenantA, () => repositorio.obtener(persona.id))) as Persona;

    lecturaUno.asignarRol('CLI', 'PACIENTE', HOY);
    await enTenant(tenantA, () => repositorio.guardar(lecturaUno));
    lecturaDos.asignarRol('GYM', 'SOCIO', HOY);

    await expect(enTenant(tenantA, () => repositorio.guardar(lecturaDos))).rejects.toBeInstanceOf(ConflictError);
    const final = await enTenant(tenantA, () => repositorio.obtener(persona.id));
    expect(final?.roles.map((asignado) => asignado.productoCodigo)).toEqual(['CLI']);
    expect(final?.version).toBe(2);
  });

  it('el verificador de referencias detecta un tipo de documento usado por personas del tenant', async () => {
    const verificador = new VerificadorReferenciasPer(unidadDeTrabajo, contexto);
    const tenantConCarnet = uuidV7();
    const conCarnet = Persona.registrar({
      id: uuidV7(),
      tenantId: tenantConCarnet,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.crear('CE', '001234567'),
      nombres: 'John',
      apellidoPaterno: 'Smith',
      contactos: [Contacto.crear({ id: uuidV7(), tipo: 'CELULAR', valor: '987654321', principal: true })],
    });
    await enTenant(tenantConCarnet, () => repositorio.guardar(conCarnet));
    const referencia = (catalogo: string, codigo: string) => ({ itemId: ITEM_ID, catalogo, codigo });
    const estaReferenciado = (catalogo: string, codigo: string) =>
      enTenant(tenantConCarnet, () => verificador.estaReferenciado(referencia(catalogo, codigo)));

    expect(await estaReferenciado('TIPO_DOC_IDENTIDAD', 'CE')).toBe(true);
    expect(await estaReferenciado('TIPO_DOC_IDENTIDAD', 'PASAPORTE')).toBe(false);
    expect(await estaReferenciado('MONEDA', 'CE')).toBe(false);
  });

  describe('casos de uso con el outbox real', () => {
    const tenantConOutbox = uuidV7();
    const JUANA = {
      tipoPersona: 'NATURAL' as const,
      tipoDocumento: 'DNI',
      numeroDocumento: '45781236',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      celular: '987654321',
    };
    let dependencias: DependenciasPersonas;

    const eventosEnOutbox = (): Promise<{ event_type: string; version: string; payload: unknown }[]> =>
      dataSource.query(`SELECT event_type, version, payload FROM sync.outbox WHERE tenant_id = $1 ORDER BY seq`, [
        tenantConOutbox,
      ]);

    beforeAll(() => {
      const validador = new InMemoryEventSchemaValidator();
      registrarEsquemasPer(validador);
      dependencias = {
        unidadDeTrabajo,
        contexto,
        reloj: new SystemClock(),
        ids: { next: uuidV7 },
        publicador: new OutboxPublisher(unidadDeTrabajo, contexto, validador, { next: uuidV7 }),
        personas: repositorio,
        suscripciones: new SuscripcionesFijas(['CLI']),
        catalogo: new CatalogoFijo(),
        identidad: new IdentidadEspia(),
        consentimientos: new RepositorioConsentimientosTypeOrm(unidadDeTrabajo, contexto),
        auditoria: new AuditoriaEspia(),
        archivos: new ArchivosFijos(),
      };
    });

    it('registrar y asignar rol dejan la persona, el rol y sus eventos, cada uno en su transacción', async () => {
      const juana = await contexto.run({ tenantId: tenantConOutbox }, () => new RegistrarPersona(dependencias).ejecutar(JUANA));
      await contexto.run({ tenantId: tenantConOutbox }, () =>
        new AsignarRolPersona(dependencias).ejecutar({ personaId: juana.id, productoCodigo: 'CLI', rol: 'PACIENTE' }),
      );

      expect(await eventosEnOutbox()).toEqual([
        {
          event_type: 'persona.registrada',
          version: '1',
          payload: { persona_id: juana.id, tipo_persona: 'NATURAL', tipo_documento: 'DNI' },
        },
        {
          event_type: 'persona.rol_asignado',
          version: '2',
          payload: { persona_id: juana.id, producto_codigo: 'CLI', rol: 'PACIENTE', desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
        },
      ]);
    });

    it('si el outbox falla, la persona tampoco queda guardada', async () => {
      const sinEsquemas = new OutboxPublisher(unidadDeTrabajo, contexto, new InMemoryEventSchemaValidator(), { next: uuidV7 });
      const registrar = new RegistrarPersona({ ...dependencias, publicador: sinEsquemas });

      const registrarSinEsquema = contexto.run({ tenantId: tenantConOutbox }, () =>
        registrar.ejecutar({ ...JUANA, numeroDocumento: '45781299' }),
      );

      await expect(registrarSinEsquema).rejects.toMatchObject({ code: 'event_schema_invalid' });
      expect(await enTenant(tenantConOutbox, () => repositorio.buscarPorDocumento('DNI', '45781299'))).toBeNull();
    });
  });
});
