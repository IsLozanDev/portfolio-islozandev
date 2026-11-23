import { ConflictError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { ActualizarDatosBasicos } from '../src/application/actualizar-datos-basicos.js';
import { AgregarContacto } from '../src/application/agregar-contacto.js';
import { AgregarDireccion } from '../src/application/agregar-direccion.js';
import type { DependenciasPersonas } from '../src/application/dependencias-personas.js';
import { EditarContacto } from '../src/application/editar-contacto.js';
import { EliminarDireccion } from '../src/application/eliminar-direccion.js';
import { RegistrarPersona } from '../src/application/registrar-persona.js';
import { Contacto } from '../src/domain/contacto.js';
import { Direccion } from '../src/domain/direccion.js';
import { DocumentoIdentidad } from '../src/domain/documento-identidad.js';
import { ContactoDuplicadoError } from '../src/domain/errores.js';
import { Persona } from '../src/domain/persona.js';
import { registrarEsquemasPer } from '../src/infrastructure/event-schemas.js';
import { ContactoEntidad, ENTIDADES_PER } from '../src/infrastructure/typeorm/entidades.js';
import { ConsultaPersonasTypeOrm } from '../src/infrastructure/typeorm/consulta-personas.typeorm.js';
import { RepositorioPersonasTypeOrm } from '../src/infrastructure/typeorm/personas.repositorio.js';
import { VerificadorReferenciasPer } from '../src/infrastructure/verificador-referencias.per.js';
import { ArchivosFijos, AuditoriaEspia, CatalogoFijo, IdentidadEspia, SuscripcionesFijas, UBIGEO_CAYMA } from './support/dobles.js';
import { RepositorioConsentimientosTypeOrm } from '../src/infrastructure/typeorm/consentimientos.repositorio.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const ITEM_ID = '32000000-0000-4000-8000-0000000000d1';
const CAYMA = { distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const PRIMER_DNI = 46_000_000;

describeConDb('Contactos y direcciones de personas con TypeORM (TR-RF-041, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let repositorio: RepositorioPersonasTypeOrm;
  let siguienteDni = PRIMER_DNI;
  const tenantA = uuidV7();
  const tenantB = uuidV7();

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(trabajo));

  const celular = (valor: string, principal = false) => Contacto.crear({ id: uuidV7(), tipo: 'CELULAR', valor, principal });
  const direccionEn = (texto: string, principal = false) =>
    Direccion.crear({ id: uuidV7(), direccion: texto, ubigeo: UBIGEO_CAYMA, ubicacion: CAYMA, principal });

  /** Juana con celular y correo principales, ya guardada en el tenant. */
  async function guardada(tenantId = tenantA): Promise<Persona> {
    siguienteDni += 1;
    const persona = Persona.registrar({
      id: uuidV7(),
      tenantId,
      tipoPersona: 'NATURAL',
      documento: DocumentoIdentidad.crear('DNI', String(siguienteDni)),
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      contactos: [celular('987654321', true), Contacto.crear({ id: uuidV7(), tipo: 'CORREO', valor: 'juana@vitrina.pe', principal: true })],
    });
    await enTenant(tenantId, () => repositorio.guardar(persona));
    return persona;
  }

  /** Lee, aplica el cambio y guarda en una sola transacción, como un caso de uso. */
  const modificar = (personaId: string, cambio: (persona: Persona) => void, tenantId = tenantA): Promise<void> =>
    enTenant(tenantId, async () => {
      const leida = (await repositorio.obtener(personaId)) as Persona;
      cambio(leida);
      await repositorio.guardar(leida);
    });

  const leer = async (personaId: string, tenantId = tenantA): Promise<Persona> =>
    (await enTenant(tenantId, () => repositorio.obtener(personaId))) as Persona;

  async function contar(tabla: 'contacto' | 'direccion', personaId: string): Promise<number> {
    const [{ filas }] = await dataSource.query(`SELECT count(*)::int AS filas FROM per.${tabla} WHERE persona_id = $1`, [personaId]);
    return filas;
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

  it('agrega una dirección y la lee con su ubicación copiada', async () => {
    const persona = await guardada();

    await modificar(persona.id, (leida) => leida.agregarDireccion(direccionEn('Av. Ejército 710', true)));

    const final = await leer(persona.id);
    expect(final.direcciones).toHaveLength(1);
    expect(final.direcciones[0]).toMatchObject({
      direccion: 'Av. Ejército 710',
      referencia: null,
      ubigeo: UBIGEO_CAYMA,
      ubicacion: CAYMA,
      principal: true,
    });
    expect(final.version).toBe(2);
  });

  it('cambia de principal en una sola transacción, en contactos y en direcciones', async () => {
    const persona = await guardada();
    const primera = direccionEn('Av. Ejército 710', true);
    const segunda = direccionEn('Calle Mercaderes 120');
    await modificar(persona.id, (leida) => leida.agregarDireccion(primera));
    await modificar(persona.id, (leida) => leida.agregarDireccion(segunda));

    await modificar(persona.id, (leida) => leida.agregarContacto(celular('912345678', true)));
    await modificar(persona.id, (leida) => leida.editarDireccion(segunda.id, { principal: true }));

    const final = await leer(persona.id);
    const celulares = final.contactos.filter((contacto) => contacto.tipo === 'CELULAR');
    expect(celulares.map(({ valor, principal }) => [valor, principal])).toEqual([
      ['987654321', false],
      ['912345678', true],
    ]);
    expect(final.direcciones.map(({ direccion, principal }) => [direccion, principal])).toEqual([
      ['Av. Ejército 710', false],
      ['Calle Mercaderes 120', true],
    ]);
  });

  it('volver a marcar el principal anterior intercambia los dos en la misma transacción', async () => {
    const persona = await guardada();
    const original = persona.contactos[0];
    await modificar(persona.id, (leida) => leida.agregarContacto(celular('912345678', true)));

    await modificar(persona.id, (leida) => leida.editarContacto(original.id, { principal: true }));

    const celulares = (await leer(persona.id)).contactos.filter((contacto) => contacto.tipo === 'CELULAR');
    expect(celulares.map(({ valor, principal }) => [valor, principal])).toEqual([
      ['987654321', true],
      ['912345678', false],
    ]);
  });

  it('edita el valor de un contacto y el texto de una dirección sin tocar las demás filas', async () => {
    const persona = await guardada();
    const direccion = direccionEn('Av. Ejército 710');
    await modificar(persona.id, (leida) => leida.agregarDireccion(direccion));
    const correo = persona.contactos[1];

    await modificar(persona.id, (leida) => leida.editarContacto(correo.id, { valor: 'juana.quispe@vitrina.pe' }));
    await modificar(persona.id, (leida) => leida.editarDireccion(direccion.id, { direccion: 'Av. Ejército 712', referencia: 'Puerta azul' }));

    const final = await leer(persona.id);
    expect(final.contactos.map(({ valor }) => valor).sort()).toEqual(['987654321', 'juana.quispe@vitrina.pe']);
    expect(final.direcciones[0]).toMatchObject({ direccion: 'Av. Ejército 712', referencia: 'Puerta azul', ubicacion: CAYMA });
  });

  it('borra físicamente el contacto y la dirección', async () => {
    const persona = await guardada();
    const direccion = direccionEn('Av. Ejército 710', true);
    await modificar(persona.id, (leida) => leida.agregarDireccion(direccion));
    const correo = persona.contactos[1];

    await modificar(persona.id, (leida) => leida.eliminarContacto(correo.id));
    await modificar(persona.id, (leida) => leida.eliminarDireccion(direccion.id));

    expect([await contar('contacto', persona.id), await contar('direccion', persona.id)]).toEqual([1, 0]);
    const final = await leer(persona.id);
    expect(final.contactos.map(({ tipo }) => tipo)).toEqual(['CELULAR']);
    expect(final.direcciones).toEqual([]);
    expect(final.version).toBe(4);
  });

  it('guarda la denominación con la versión nueva y mueve actualizado_en', async () => {
    const persona = await guardada();
    const [antes] = await dataSource.query(`SELECT actualizado_en FROM per.persona WHERE id = $1`, [persona.id]);

    await modificar(persona.id, (leida) => leida.cambiarDatosBasicos({ nombres: 'Juana María', apellidoMaterno: null }));

    const [fila] = await dataSource.query(
      `SELECT nombres, apellido_paterno, apellido_materno, razon_social, version, actualizado_en, tipo_documento FROM per.persona WHERE id = $1`,
      [persona.id],
    );
    expect(fila).toMatchObject({
      nombres: 'Juana María',
      apellido_paterno: 'Quispe',
      apellido_materno: null,
      razon_social: null,
      version: 2,
      tipo_documento: 'DNI',
    });
    expect(new Date(fila.actualizado_en).getTime()).toBeGreaterThan(new Date(antes.actualizado_en).getTime());
  });

  it('guardar sin cambios no escribe contactos ni direcciones', async () => {
    const persona = await guardada();
    await modificar(persona.id, (leida) => leida.agregarDireccion(direccionEn('Av. Ejército 710')));

    await modificar(persona.id, () => undefined);

    const final = await leer(persona.id);
    expect([final.version, final.contactos.length, final.direcciones.length]).toEqual([2, 2, 1]);
  });

  it('conflicto de versión: la segunda escritura falla y no deja su contacto ni su dirección', async () => {
    const persona = await guardada();
    const lecturaUno = await leer(persona.id);
    const lecturaDos = await leer(persona.id);

    lecturaUno.agregarContacto(celular('912345678'));
    await enTenant(tenantA, () => repositorio.guardar(lecturaUno));
    lecturaDos.agregarDireccion(direccionEn('Av. Ejército 710'));
    lecturaDos.agregarContacto(celular('923456789'));

    await expect(enTenant(tenantA, () => repositorio.guardar(lecturaDos))).rejects.toBeInstanceOf(ConflictError);
    expect([await contar('contacto', persona.id), await contar('direccion', persona.id)]).toEqual([3, 0]);
    expect((await leer(persona.id)).version).toBe(2);
  });

  it('dos transacciones a la vez sobre la misma persona: la segunda recibe el conflicto', async () => {
    const persona = await guardada();
    const lecturaSegunda = await leer(persona.id);
    let confirmarPrimera = (): void => undefined;
    const primeraPuedeConfirmar = new Promise<void>((resolver) => (confirmarPrimera = resolver));
    let avisarGuardada = (): void => undefined;
    const primeraGuardada = new Promise<void>((resolver) => (avisarGuardada = resolver));

    const transaccionPrimera = enTenant(tenantA, async () => {
      const leida = (await repositorio.obtener(persona.id)) as Persona;
      leida.agregarContacto(celular('912345678'));
      await repositorio.guardar(leida);
      avisarGuardada();
      await primeraPuedeConfirmar;
    });
    await primeraGuardada;
    lecturaSegunda.agregarContacto(celular('923456789'));
    // Queda esperando la fila de la persona hasta que la primera transacción confirme.
    const transaccionSegunda = enTenant(tenantA, () => repositorio.guardar(lecturaSegunda));
    confirmarPrimera();

    await transaccionPrimera;
    await expect(transaccionSegunda).rejects.toBeInstanceOf(ConflictError);
    expect(await contar('contacto', persona.id)).toBe(3);
  });

  it('traduce la violación de uq_contacto_valor a ContactoDuplicadoError', async () => {
    const persona = await guardada();
    const leida = await leer(persona.id);
    // Otra escritura mete el mismo contacto sin pasar por el agregado: solo queda el índice único.
    await enTenant(tenantA, () =>
      unidadDeTrabajo.manager
        .getRepository(ContactoEntidad)
        .insert({ id: uuidV7(), personaId: persona.id, tenantId: tenantA, tipoContacto: 'FIJO', valor: '054234567', principal: false }),
    );
    leida.agregarContacto(Contacto.crear({ id: uuidV7(), tipo: 'FIJO', valor: '054234567', principal: false }));

    const guardarRepetido = enTenant(tenantA, () => repositorio.guardar(leida));

    await expect(guardarRepetido).rejects.toBeInstanceOf(ContactoDuplicadoError);
    expect(await contar('contacto', persona.id)).toBe(3);
    expect((await leer(persona.id)).version).toBe(1);
  });

  // La barrera de aplicación: el filtro por tenant del repositorio. La RLS la prueba 01l_per_contactos.test.sql.
  it('aísla por tenant: B no ve a la persona de A ni puede escribir sus contactos o direcciones', async () => {
    const deA = await guardada();
    const direccion = direccionEn('Av. Ejército 710', true);
    await modificar(deA.id, (leida) => leida.agregarDireccion(direccion));
    const leidaPorA = await leer(deA.id);
    leidaPorA.eliminarDireccion(direccion.id);
    leidaPorA.agregarContacto(celular('912345678'));

    expect(await enTenant(tenantB, () => repositorio.obtener(deA.id))).toBeNull();
    await expect(enTenant(tenantB, () => repositorio.guardar(leidaPorA))).rejects.toBeInstanceOf(ConflictError);
    expect([await contar('contacto', deA.id), await contar('direccion', deA.id)]).toEqual([2, 1]);
  });

  it('el verificador de referencias detecta un ubigeo usado por direcciones del tenant', async () => {
    const verificador = new VerificadorReferenciasPer(unidadDeTrabajo, contexto);
    const tenantConDireccion = uuidV7();
    const persona = await guardada(tenantConDireccion);
    await modificar(persona.id, (leida) => leida.agregarDireccion(direccionEn('Av. Ejército 710')), tenantConDireccion);
    const estaReferenciado = (catalogo: string, codigo: string, tenantId = tenantConDireccion) =>
      enTenant(tenantId, () => verificador.estaReferenciado({ itemId: ITEM_ID, catalogo, codigo }));

    expect(await estaReferenciado('UBIGEO', UBIGEO_CAYMA)).toBe(true);
    expect(await estaReferenciado('UBIGEO', '040101')).toBe(false);
    expect(await estaReferenciado('TIPO_DOC_IDENTIDAD', UBIGEO_CAYMA)).toBe(false);
    expect(await estaReferenciado('UBIGEO', UBIGEO_CAYMA, uuidV7())).toBe(false);
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

    const comoTenant = <Resultado>(trabajo: () => Promise<Resultado>): Promise<Resultado> =>
      contexto.run({ tenantId: tenantConOutbox }, trabajo);

    const actualizadasEnOutbox = (): Promise<{ version: string; payload: unknown }[]> =>
      dataSource.query(
        `SELECT version, payload FROM sync.outbox WHERE tenant_id = $1 AND event_type = 'persona.actualizada' ORDER BY seq`,
        [tenantConOutbox],
      );

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
        consultaPersonas: new ConsultaPersonasTypeOrm(unidadDeTrabajo, contexto),
        suscripciones: new SuscripcionesFijas(['CLI']),
        catalogo: new CatalogoFijo(),
        identidad: new IdentidadEspia(),
        consentimientos: new RepositorioConsentimientosTypeOrm(unidadDeTrabajo, contexto),
        auditoria: new AuditoriaEspia(),
        archivos: new ArchivosFijos(),
      };
    });

    it('cada cambio deja su fila y su persona.actualizada en la misma transacción; sin cambio no hay evento', async () => {
      const juana = await comoTenant(() => new RegistrarPersona(dependencias).ejecutar(JUANA));

      const conNombres = await comoTenant(() =>
        new ActualizarDatosBasicos(dependencias).ejecutar({ personaId: juana.id, version: juana.version, nombres: 'Juana María' }),
      );
      const conCelular = await comoTenant(() =>
        new AgregarContacto(dependencias).ejecutar({ personaId: juana.id, tipo: 'CELULAR', valor: '912345678', principal: true }),
      );
      const conDireccion = await comoTenant(() =>
        new AgregarDireccion(dependencias).ejecutar({ personaId: juana.id, direccion: 'Av. Ejército 710', ubigeo: UBIGEO_CAYMA, principal: true }),
      );
      const [direccion] = conDireccion.direcciones;
      const sinCambio = await comoTenant(() =>
        new EditarContacto(dependencias).ejecutar({ personaId: juana.id, contactoId: conCelular.contactos[1].id, version: conDireccion.version, principal: true }),
      );
      await comoTenant(() =>
        new EliminarDireccion(dependencias).ejecutar({ personaId: juana.id, direccionId: direccion.id, version: sinCambio.version }),
      );

      expect([conNombres.version, conCelular.version, conDireccion.version, sinCambio.version]).toEqual([2, 3, 4, 4]);
      expect(direccion).toMatchObject({ distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA', principal: true });
      expect(await actualizadasEnOutbox()).toEqual([
        { version: '2', payload: { persona_id: juana.id, cambio: 'DATOS_BASICOS' } },
        { version: '3', payload: { persona_id: juana.id, cambio: 'CONTACTO' } },
        { version: '4', payload: { persona_id: juana.id, cambio: 'DIRECCION' } },
        { version: '5', payload: { persona_id: juana.id, cambio: 'DIRECCION' } },
      ]);
      expect(await contar('direccion', juana.id)).toBe(0);
    });

    it('si el outbox falla, el contacto tampoco queda guardado', async () => {
      const juana = await comoTenant(() => new RegistrarPersona(dependencias).ejecutar({ ...JUANA, numeroDocumento: '45781299' }));
      const sinEsquemas = new OutboxPublisher(unidadDeTrabajo, contexto, new InMemoryEventSchemaValidator(), { next: uuidV7 });
      const agregar = new AgregarContacto({ ...dependencias, publicador: sinEsquemas });

      const agregarSinEsquema = comoTenant(() => agregar.ejecutar({ personaId: juana.id, tipo: 'FIJO', valor: '054234567' }));

      await expect(agregarSinEsquema).rejects.toMatchObject({ code: 'event_schema_invalid' });
      expect(await contar('contacto', juana.id)).toBe(1);
    });
  });
});
