import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { EVENT_PUBLISHER, InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import type { ProgramarNotificacionComando } from '../src/application/ports/notificacion.port.js';
import { CancelarProgramaciones } from '../src/application/programaciones/cancelar-programaciones.js';
import { EjecutarProgramacion } from '../src/application/programaciones/ejecutar-programacion.js';
import { ProgramarNotificacion } from '../src/application/programaciones/programar-notificacion.js';
import { ProgramacionModificadaError } from '../src/domain/errores.js';
import { registrarEsquemasNot } from '../src/infrastructure/event-schemas.js';
import { RepositorioBajasTypeOrm } from '../src/infrastructure/typeorm/bajas.repositorio.js';
import { RepositorioContactosInvalidosTypeOrm } from '../src/infrastructure/typeorm/contactos-invalidos.repositorio.js';
import { ENTIDADES_NOT } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioMensajesTypeOrm } from '../src/infrastructure/typeorm/mensajes.repositorio.js';
import { RepositorioPlantillasTypeOrm } from '../src/infrastructure/typeorm/plantillas.repositorio.js';
import { ProgramacionesAtrasadasSql } from '../src/infrastructure/typeorm/programaciones-atrasadas.sql.js';
import { RepositorioProgramacionesTypeOrm } from '../src/infrastructure/typeorm/programaciones.repositorio.js';
import { ConsentimientosMemoria, PersonasMemoria, RelojFijo } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const UNA_HORA_MS = 3_600_000;
const REFERENCIA = { tipo: 'psi.cita', id: 'cita-1' };

interface FilaCruda {
  id: string;
  estado: string;
  version: number;
  mensaje_id: string | null;
  destinatario: unknown;
}

describeConDb('Programaciones con TypeORM (spec 45, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: TenantContext;
  let reloj: RelojFijo;
  let programar: ProgramarNotificacion;
  let cancelar: CancelarProgramaciones;
  let ejecutar: EjecutarProgramacion;
  let programaciones: RepositorioProgramacionesTypeOrm;
  let unidadDeTrabajo: TypeOrmUnitOfWork;

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> => contexto.run({ tenantId }, trabajo);
  const comando = (cambios: Partial<ProgramarNotificacionComando> = {}): ProgramarNotificacionComando => ({
    plantilla: 'PRUEBA_CORREO',
    destinatario: { correo: 'ana@ejemplo.pe' },
    variables: { nombre: 'Ana', producto: 'SazónPOS' },
    finalidad: 'TRANSACCIONAL',
    enviarEn: new Date(reloj.now().getTime() + UNA_HORA_MS),
    referencia: REFERENCIA,
    ...cambios,
  });

  // Lecturas crudas como superusuario de la base temporal: ven todas las filas sin depender de la RLS.
  const programacionesDe = (tenantId: string): Promise<FilaCruda[]> =>
    dataSource.query('SELECT id, estado, version, mensaje_id, destinatario FROM ntf.programacion WHERE tenant_id = $1 ORDER BY creado_en', [tenantId]);
  const eventosDe = (tenantId: string): Promise<{ event_type: string; payload: Record<string, unknown> }[]> =>
    dataSource.query("SELECT event_type, payload FROM sync.outbox WHERE tenant_id = $1 AND event_type LIKE 'not.programacion.%'", [tenantId]);

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
    unidadDeTrabajo = app.get(TypeOrmUnitOfWork);
    // El mismo reloj para programar y ejecutar: la base compara enviar_en con now() solo en el barrido.
    reloj = new RelojFijo(new Date());
    const ids = { next: uuidV7 };
    const publicador = app.get<EventPublisher>(EVENT_PUBLISHER);
    const plantillas = new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto);
    programaciones = new RepositorioProgramacionesTypeOrm(unidadDeTrabajo, contexto);
    const dependencias = { unidadDeTrabajo, contexto, reloj, ids, publicador, plantillas, programaciones };
    programar = new ProgramarNotificacion(dependencias);
    cancelar = new CancelarProgramaciones(dependencias);
    const enviar = new EnviarNotificacion({
      ...dependencias,
      mensajes: new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto),
      contactosInvalidos: new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto),
      bajas: new RepositorioBajasTypeOrm(unidadDeTrabajo, contexto),
      enlacePreferencias: null,
      avisar: () => undefined,
      personas: new PersonasMemoria(),
      consentimientos: new ConsentimientosMemoria(),
      hashearDestino: (destino) => `sha256:${destino}`,
      zonaHoraria: 'America/Lima',
    });
    ejecutar = new EjecutarProgramacion({ unidadDeTrabajo, contexto, reloj, programaciones, notificaciones: enviar });
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('la misma referencia dos veces deja una viva con reprogramada = true y dos eventos, sin destinatario', async () => {
    const tenantId = uuidV7();

    const primera = await enTenant(tenantId, () => programar.ejecutar(comando()));
    const segunda = await enTenant(tenantId, () => programar.ejecutar(comando({ destinatario: { correo: 'beto@ejemplo.pe' } })));

    expect(segunda).toMatchObject({ programacionId: primera.programacionId, reprogramada: true });
    expect(await programacionesDe(tenantId)).toEqual([
      { id: primera.programacionId, estado: 'PROGRAMADA', version: 2, mensaje_id: null, destinatario: { correo: 'beto@ejemplo.pe' } },
    ]);
    const eventos = await eventosDe(tenantId);
    expect(eventos.map((evento) => evento.payload.version)).toEqual([1, 2]);
    expect(JSON.stringify(eventos)).not.toContain('ejemplo.pe');
  });

  it('cancelar sin vivas devuelve 0; con una viva la deja CANCELADA y la ejecución no crea mensaje', async () => {
    const tenantId = uuidV7();
    expect(await enTenant(tenantId, () => cancelar.ejecutar(REFERENCIA))).toBe(0);
    const { programacionId } = await enTenant(tenantId, () => programar.ejecutar(comando()));

    expect(await enTenant(tenantId, () => cancelar.ejecutar(REFERENCIA))).toBe(1);
    expect(await ejecutar.ejecutar({ tenantId, programacionId, version: 1 })).toBe('SIN_EFECTO');

    expect((await programacionesDe(tenantId))[0].estado).toBe('CANCELADA');
    expect(await dataSource.query('SELECT 1 FROM ntf.mensaje WHERE tenant_id = $1', [tenantId])).toEqual([]);
  });

  it('TR-CA-190: a la hora crea el mensaje en la misma transacción y la deja ENVIADA con su mensaje_id', async () => {
    const tenantId = uuidV7();
    const { programacionId } = await enTenant(tenantId, () => programar.ejecutar(comando()));

    expect(await ejecutar.ejecutar({ tenantId, programacionId, version: 1 })).toBe('ENVIADA');
    expect(await ejecutar.ejecutar({ tenantId, programacionId, version: 1 })).toBe('SIN_EFECTO');

    const [fila] = await programacionesDe(tenantId);
    expect(fila).toMatchObject({ estado: 'ENVIADA', version: 2 });
    const mensajes = await dataSource.query('SELECT id, clave_idempotencia FROM ntf.mensaje WHERE tenant_id = $1', [tenantId]);
    expect(mensajes).toEqual([{ id: fila.mensaje_id, clave_idempotencia: programacionId }]);
  });

  it('TR-RNF-010: otro tenant no ve ni cancela la programación', async () => {
    const tenantA = uuidV7();
    const tenantB = uuidV7();
    const { programacionId } = await enTenant(tenantA, () => programar.ejecutar(comando()));

    expect(await enTenant(tenantB, () => cancelar.ejecutar(REFERENCIA))).toBe(0);
    expect(await enTenant(tenantB, () => unidadDeTrabajo.run(() => programaciones.obtener(programacionId)))).toBeNull();
    expect(await ejecutar.ejecutar({ tenantId: tenantB, programacionId, version: 1 })).toBe('SIN_EFECTO');

    expect((await programacionesDe(tenantA))[0].estado).toBe('PROGRAMADA');
  });

  it('bloqueo optimista: actualizar con una versión vieja lanza ProgramacionModificadaError', async () => {
    const tenantId = uuidV7();
    const { programacionId } = await enTenant(tenantId, () => programar.ejecutar(comando()));

    await enTenant(tenantId, () =>
      unidadDeTrabajo.run(async () => {
        const programacion = await programaciones.obtener(programacionId);
        if (!programacion) throw new Error('sin programación');
        programacion.cancelar(reloj.now());
        await expect(programaciones.actualizar(programacion, 7)).rejects.toThrow(ProgramacionModificadaError);
      }),
    );
  });

  it('el barrido devuelve solo las PROGRAMADA vencidas, de todos los tenants, fuera de toda transacción', async () => {
    const tenantId = uuidV7();
    const { programacionId } = await enTenant(tenantId, () => programar.ejecutar(comando()));
    const localizador = new ProgramacionesAtrasadasSql(dataSource);

    const antesDeVencer = await localizador.atrasadas(new Date(), 500);
    const despuesDeVencer = await localizador.atrasadas(new Date(Date.now() + 2 * UNA_HORA_MS), 500);

    expect(antesDeVencer.map((atrasada) => atrasada.programacionId)).not.toContain(programacionId);
    expect(despuesDeVencer).toContainEqual({ programacionId, tenantId, version: 1 });
  });
});
