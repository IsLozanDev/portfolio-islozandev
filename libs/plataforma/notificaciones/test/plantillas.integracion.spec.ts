import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { EVENT_PUBLISHER, InMemoryEventSchemaValidator, KernelInfraModule, SystemClock, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import type { DependenciasPlantillas } from '../src/application/dependencias.js';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { ConsultarPlantilla } from '../src/application/plantillas/consultar-plantilla.js';
import { ListarPlantillas } from '../src/application/plantillas/listar-plantillas.js';
import { ListarVersionesPlantilla } from '../src/application/plantillas/listar-versiones-plantilla.js';
import { PersonalizarPlantilla } from '../src/application/plantillas/personalizar-plantilla.js';
import { RestaurarPlantillaBase } from '../src/application/plantillas/restaurar-plantilla-base.js';
import { VistaPreviaPlantilla } from '../src/application/plantillas/vista-previa-plantilla.js';
import { SinPersonalizacionError, VersionObsoletaPlantillaError } from '../src/domain/errores.js';
import { registrarEsquemasNot } from '../src/infrastructure/event-schemas.js';
import { SaneadorHtmlSanitize } from '../src/infrastructure/sanitize-html/saneador-html.sanitize.js';
import { RepositorioContactosInvalidosTypeOrm } from '../src/infrastructure/typeorm/contactos-invalidos.repositorio.js';
import { ENTIDADES_NOT } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioMensajesTypeOrm } from '../src/infrastructure/typeorm/mensajes.repositorio.js';
import { RepositorioPlantillasTypeOrm } from '../src/infrastructure/typeorm/plantillas.repositorio.js';
import { AuditoriaMemoria, ConsentimientosMemoria, PersonasMemoria } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const CODIGO = 'PRUEBA_CORREO';
const CORREO = 'CORREO';
const PLANTILLA_BASE = '42000000-0000-0000-0000-000000000001';
const ACTOR = '43000000-0000-7000-8000-0000000000f1';

describeConDb('Plantillas personalizadas con TypeORM (spec 43, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: TenantContext;
  let personalizar: PersonalizarPlantilla;
  let restaurar: RestaurarPlantillaBase;
  let consultar: ConsultarPlantilla;
  let enviar: EnviarNotificacion;
  let dependencias: DependenciasPlantillas;

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId, actorId: ACTOR }, trabajo);
  const guardar = (tenantId: string, version: number | null, cuerpo = '<p>Hola {{nombre}} de {{producto}}</p>') =>
    enTenant(tenantId, () => personalizar.ejecutar(CODIGO, CORREO, { asunto: 'Propia {{producto}}', cuerpo, version }));
  // Lecturas crudas como superusuario de la base temporal: ven todas las filas sin depender de la RLS.
  const filasDe = (tenantId: string): Promise<{ version: number; activa: boolean; creado_por: string; plantilla_base_id: string }[]> =>
    dataSource.query('SELECT version, activa, creado_por, plantilla_base_id FROM ntf.plantilla WHERE tenant_id = $1 ORDER BY version', [tenantId]);

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_NOT });
    await dataSource.initialize();
    const validador = new InMemoryEventSchemaValidator();
    registrarEsquemasNot(validador);

    @Module({ imports: [KernelInfraModule.register({ dataSource, validator: validador })] })
    class PruebaModule {}

    app = await NestFactory.createApplicationContext(PruebaModule, { logger: false });
    contexto = app.get(TENANT_CONTEXT);
    const unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    const reloj = new SystemClock();
    const ids = { next: uuidV7 };
    const plantillas = new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto);
    dependencias = { unidadDeTrabajo, contexto, reloj, ids, plantillas, saneador: new SaneadorHtmlSanitize(), auditoria: new AuditoriaMemoria() };
    personalizar = new PersonalizarPlantilla(dependencias);
    restaurar = new RestaurarPlantillaBase(dependencias);
    consultar = new ConsultarPlantilla(dependencias);
    enviar = new EnviarNotificacion({
      unidadDeTrabajo,
      contexto,
      reloj,
      ids,
      publicador: app.get<EventPublisher>(EVENT_PUBLISHER),
      mensajes: new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto),
      plantillas,
      contactosInvalidos: new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto),
      personas: new PersonasMemoria(),
      consentimientos: new ConsentimientosMemoria(),
      hashearDestino: (destino) => `sha256:${destino}`,
      zonaHoraria: 'America/Lima',
    });
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('TR-CA-184: el envío del tenant usa su versión y otro tenant sigue con la base', async () => {
    const tenantA = uuidV7();
    const tenantB = uuidV7();
    await guardar(tenantA, null);
    const comando = () => ({
      plantilla: CODIGO,
      destinatario: { correo: 'ana@ejemplo.pe' },
      variables: { nombre: 'Ana', producto: 'SazónPOS' },
      finalidad: 'TRANSACCIONAL' as const,
      claveIdempotencia: uuidV7(),
    });

    const deA = await enTenant(tenantA, () => enviar.enviar(comando()));
    const deB = await enTenant(tenantB, () => enviar.enviar(comando()));

    const [mensajeA] = await dataSource.query('SELECT asunto, cuerpo, plantilla_id FROM ntf.mensaje WHERE id = $1', [deA.mensajeId]);
    const [mensajeB] = await dataSource.query('SELECT asunto, plantilla_id FROM ntf.mensaje WHERE id = $1', [deB.mensajeId]);
    expect(mensajeA).toMatchObject({ asunto: 'Propia SazónPOS', cuerpo: '<p>Hola Ana de SazónPOS</p>' });
    expect(mensajeA.plantilla_id).not.toBe(PLANTILLA_BASE);
    expect(mensajeB).toMatchObject({ asunto: 'Prueba de correo de SazónPOS', plantilla_id: PLANTILLA_BASE });
  });

  it('cada PUT inserta versión + 1 con autor y base, desactiva la anterior y el historial lista todas', async () => {
    const tenantId = uuidV7();
    await guardar(tenantId, null);
    await guardar(tenantId, 1);
    await guardar(tenantId, 2);

    expect(await filasDe(tenantId)).toEqual([
      { version: 1, activa: false, creado_por: ACTOR, plantilla_base_id: PLANTILLA_BASE },
      { version: 2, activa: false, creado_por: ACTOR, plantilla_base_id: PLANTILLA_BASE },
      { version: 3, activa: true, creado_por: ACTOR, plantilla_base_id: PLANTILLA_BASE },
    ]);
    const historial = await enTenant(tenantId, () => new ListarVersionesPlantilla(dependencias).ejecutar(CODIGO, CORREO));
    expect(historial.map((version) => [version.version, version.activa])).toEqual([
      [3, true],
      [2, false],
      [1, false],
    ]);
  });

  it('dos PUT concurrentes con la misma versión dejan una sola versión nueva y el otro recibe VERSION_OBSOLETA', async () => {
    const tenantId = uuidV7();
    await guardar(tenantId, null);

    const resultados = await Promise.allSettled([guardar(tenantId, 1, '<p>uno {{nombre}}</p>'), guardar(tenantId, 1, '<p>dos {{nombre}}</p>')]);

    expect(resultados.map((resultado) => resultado.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rechazo = resultados.find((resultado): resultado is PromiseRejectedResult => resultado.status === 'rejected');
    expect(rechazo?.reason).toBeInstanceOf(VersionObsoletaPlantillaError);
    const filas = await filasDe(tenantId);
    expect(filas.map((fila) => [fila.version, fila.activa])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('dos primeras personalizaciones concurrentes (version null): una gana y la otra recibe VERSION_OBSOLETA', async () => {
    const tenantId = uuidV7();

    const resultados = await Promise.allSettled([guardar(tenantId, null), guardar(tenantId, null)]);

    expect(resultados.map((resultado) => resultado.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await filasDe(tenantId)).map((fila) => [fila.version, fila.activa])).toEqual([[1, true]]);
  });

  it('restaurar desactiva todo, rige la base sin cambios y al volver a personalizar numera después de la mayor', async () => {
    const tenantId = uuidV7();
    await guardar(tenantId, null);
    await guardar(tenantId, 1);
    const [baseAntes] = await dataSource.query('SELECT * FROM ntf.plantilla WHERE id = $1', [PLANTILLA_BASE]);

    await enTenant(tenantId, () => restaurar.ejecutar(CODIGO, CORREO));

    expect((await filasDe(tenantId)).every((fila) => !fila.activa)).toBe(true);
    expect(await enTenant(tenantId, () => consultar.ejecutar(CODIGO, CORREO))).toMatchObject({ origen: 'BASE', version: null });
    expect((await dataSource.query('SELECT * FROM ntf.plantilla WHERE id = $1', [PLANTILLA_BASE]))[0]).toEqual(baseAntes);
    await expect(enTenant(tenantId, () => restaurar.ejecutar(CODIGO, CORREO))).rejects.toThrow(SinPersonalizacionError);
    expect((await guardar(tenantId, null)).version).toBe(3);
  });

  it('aislamiento: un tenant no ve ni restaura la personalización de otro; la lista muestra la base a B', async () => {
    const tenantA = uuidV7();
    const tenantB = uuidV7();
    await guardar(tenantA, null);
    const listar = new ListarPlantillas(dependencias);

    expect(await enTenant(tenantB, () => consultar.ejecutar(CODIGO, CORREO))).toMatchObject({ origen: 'BASE' });
    await expect(enTenant(tenantB, () => restaurar.ejecutar(CODIGO, CORREO))).rejects.toThrow(SinPersonalizacionError);
    expect((await enTenant(tenantB, () => listar.ejecutar({ pagina: 1, tamano: 25 }))).items).toEqual([
      expect.objectContaining({ codigo: CODIGO, origen: 'BASE', version: 1 }),
    ]);
    expect((await enTenant(tenantA, () => listar.ejecutar({ q: 'propia', pagina: 1, tamano: 25 }))).items).toEqual([
      expect.objectContaining({ codigo: CODIGO, origen: 'PERSONALIZADA', version: 1, asunto: 'Propia {{producto}}' }),
    ]);
    expect((await filasDe(tenantA)).map((fila) => fila.activa)).toEqual([true]);
  });

  it('la vista previa usa los ejemplos de la base sembrada y no inserta en ntf.mensaje', async () => {
    const tenantId = uuidV7();

    const vista = await enTenant(tenantId, () => new VistaPreviaPlantilla(dependencias).ejecutar(CODIGO, CORREO, {}));

    expect(vista.asunto).toBe('Prueba de correo de SazónPOS');
    expect(vista.cuerpoHtml).toContain('Hola María Quispe:');
    expect(await dataSource.query('SELECT 1 FROM ntf.mensaje WHERE tenant_id = $1', [tenantId])).toEqual([]);
  });
});
