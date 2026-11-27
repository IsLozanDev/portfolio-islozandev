import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventPublisher, TenantContext } from '@vitrina/plataforma/kernel';
import { EVENT_PUBLISHER, InMemoryEventSchemaValidator, KernelInfraModule, SystemClock, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import type { EnviarNotificacionComando } from '../src/application/ports/notificacion.port.js';
import { MensajeModificadoError } from '../src/domain/errores.js';
import { registrarEsquemasNot } from '../src/infrastructure/event-schemas.js';
import { RepositorioBajasTypeOrm } from '../src/infrastructure/typeorm/bajas.repositorio.js';
import { RepositorioContactosInvalidosTypeOrm } from '../src/infrastructure/typeorm/contactos-invalidos.repositorio.js';
import { ENTIDADES_NOT } from '../src/infrastructure/typeorm/entidades.js';
import { MensajePorIdExternoSql } from '../src/infrastructure/typeorm/mensaje-por-id-externo.sql.js';
import { RepositorioMensajesTypeOrm } from '../src/infrastructure/typeorm/mensajes.repositorio.js';
import { RepositorioPlantillasTypeOrm } from '../src/infrastructure/typeorm/plantillas.repositorio.js';
import { ConsentimientosMemoria, PersonasMemoria } from './support/dobles.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const PLANTILLA_BASE = '42000000-0000-0000-0000-000000000001';

interface FilaCruda {
  id: string;
  estado: string;
  destino_hash: string;
  version: number;
}

class ReversionBuscada extends Error {}

describeConDb('Notificaciones con TypeORM (spec 42, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let app: INestApplicationContext;
  let contexto: TenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let enviar: EnviarNotificacion;
  let mensajes: RepositorioMensajesTypeOrm;

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> => contexto.run({ tenantId }, trabajo);
  const comando = (cambios: Partial<EnviarNotificacionComando> = {}): EnviarNotificacionComando => ({
    plantilla: 'PRUEBA_CORREO',
    destinatario: { correo: 'ana@ejemplo.pe' },
    variables: { nombre: 'Ana', producto: 'SazónPOS' },
    finalidad: 'TRANSACCIONAL',
    claveIdempotencia: uuidV7(),
    ...cambios,
  });

  // Lecturas crudas como superusuario de la base temporal: ven todas las filas sin depender de la RLS.
  const mensajesDe = (tenantId: string): Promise<FilaCruda[]> =>
    dataSource.query('SELECT id, estado, destino_hash, version FROM ntf.mensaje WHERE tenant_id = $1', [tenantId]);
  const eventosDe = (tenantId: string): Promise<{ event_type: string; payload: Record<string, unknown> }[]> =>
    dataSource.query('SELECT event_type, payload FROM sync.outbox WHERE tenant_id = $1', [tenantId]);

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
    mensajes = new RepositorioMensajesTypeOrm(unidadDeTrabajo, contexto);
    enviar = new EnviarNotificacion({
      unidadDeTrabajo,
      contexto,
      reloj: new SystemClock(),
      ids: { next: uuidV7 },
      publicador: app.get<EventPublisher>(EVENT_PUBLISHER),
      mensajes,
      plantillas: new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto),
      contactosInvalidos: new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto),
      bajas: new RepositorioBajasTypeOrm(unidadDeTrabajo, contexto),
      enlacePreferencias: null,
      avisar: () => undefined,
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

  it('registra el mensaje con la plantilla base y publica not.mensaje.solicitado en el outbox', async () => {
    const tenantId = uuidV7();

    const registrada = await enTenant(tenantId, () => enviar.enviar(comando()));

    expect(registrada).toMatchObject({ estado: 'ENCOLADO', repetida: false });
    expect(await mensajesDe(tenantId)).toEqual([{ id: registrada.mensajeId, estado: 'ENCOLADO', destino_hash: 'sha256:ana@ejemplo.pe', version: 1 }]);
    expect(await eventosDe(tenantId)).toEqual([{ event_type: 'not.mensaje.solicitado', payload: { mensaje_id: registrada.mensajeId } }]);
  });

  it('TR-RNF-008: dos envíos concurrentes con la misma clave dejan un mensaje y un evento', async () => {
    const tenantId = uuidV7();
    const datos = comando();

    const [primero, segundo] = await Promise.all([enTenant(tenantId, () => enviar.enviar(datos)), enTenant(tenantId, () => enviar.enviar(datos))]);

    expect(primero.mensajeId).toBe(segundo.mensajeId);
    expect([primero.repetida, segundo.repetida].sort()).toEqual([false, true]);
    expect(await mensajesDe(tenantId)).toHaveLength(1);
    expect(await eventosDe(tenantId)).toHaveLength(1);
  });

  it('si la transacción del llamador se revierte no queda mensaje ni evento', async () => {
    const tenantId = uuidV7();

    const llamador = enTenant(tenantId, () =>
      unidadDeTrabajo.run(async () => {
        await enviar.enviar(comando());
        throw new ReversionBuscada();
      }),
    );

    await expect(llamador).rejects.toThrow(ReversionBuscada);
    expect(await mensajesDe(tenantId)).toEqual([]);
    expect(await eventosDe(tenantId)).toEqual([]);
  });

  it('bloqueo optimista: actualizar con una versión vieja lanza MensajeModificadoError', async () => {
    const tenantId = uuidV7();
    const { mensajeId } = await enTenant(tenantId, () => enviar.enviar(comando()));

    await enTenant(tenantId, () =>
      unidadDeTrabajo.run(async () => {
        const mensaje = await mensajes.obtener(mensajeId);
        if (!mensaje) throw new Error('sin mensaje');
        mensaje.marcarEnviado('re_bloqueo', new Date());
        await mensajes.actualizar(mensaje, 1);
        mensaje.marcarEntregado(new Date());
        await expect(mensajes.actualizar(mensaje, 1)).rejects.toThrow(MensajeModificadoError);
      }),
    );
    expect((await mensajesDe(tenantId))[0]).toMatchObject({ estado: 'ENVIADO', version: 2 });
  });

  it('aislamiento: un tenant no lee el mensaje de otro; la plantilla del tenant gana a la base', async () => {
    const tenantA = uuidV7();
    const tenantB = uuidV7();
    const { mensajeId } = await enTenant(tenantA, () => enviar.enviar(comando()));
    await dataSource.query(
      `INSERT INTO ntf.plantilla (id, tenant_id, codigo, canal, version, asunto, cuerpo, variables, plantilla_base_id, nombre)
       VALUES ($1, $2, 'PRUEBA_CORREO', 'CORREO', 2, 'Propia de A {{producto}}', '<p>{{nombre}}</p>', '[{"nombre":"nombre","tipo":"texto"},{"nombre":"producto","tipo":"texto"}]', $3, 'Correo de prueba')`,
      [uuidV7(), tenantA, PLANTILLA_BASE],
    );
    const plantillas = new RepositorioPlantillasTypeOrm(unidadDeTrabajo, contexto);

    expect(await enTenant(tenantB, () => unidadDeTrabajo.run(() => mensajes.obtener(mensajeId)))).toBeNull();
    expect((await enTenant(tenantA, () => unidadDeTrabajo.run(() => plantillas.vigente('PRUEBA_CORREO', 'CORREO', 'es'))))?.version).toBe(2);
    expect((await enTenant(tenantB, () => unidadDeTrabajo.run(() => plantillas.vigente('PRUEBA_CORREO', 'CORREO', 'es'))))?.id).toBe(PLANTILLA_BASE);
  });

  it('el localizador cruza tenants por id externo; intentos y contactos inválidos son idempotentes donde deben', async () => {
    const tenantId = uuidV7();
    const { mensajeId } = await enTenant(tenantId, () => enviar.enviar(comando()));
    const idExterno = `re_${mensajeId}`;
    await dataSource.query('UPDATE ntf.mensaje SET id_externo = $1, estado = $2 WHERE id = $3', [idExterno, 'ENVIADO', mensajeId]);
    const contactos = new RepositorioContactosInvalidosTypeOrm(unidadDeTrabajo, contexto);

    expect(await new MensajePorIdExternoSql(dataSource).porIdExterno(idExterno)).toEqual({ mensajeId, tenantId });
    expect(await new MensajePorIdExternoSql(dataSource).porIdExterno('re_desconocido')).toBeNull();
    await enTenant(tenantId, () =>
      unidadDeTrabajo.run(async () => {
        expect(await mensajes.siguienteNumeroIntento(mensajeId)).toBe(1);
        await mensajes.registrarIntento({ id: uuidV7(), tenantId, mensajeId, numero: 1, resultado: 'ACEPTADO', respuestaProveedor: { id_externo: idExterno }, en: new Date() });
        expect(await mensajes.siguienteNumeroIntento(mensajeId)).toBe(2);
        await contactos.marcar('CORREO', 'sha256:ana@ejemplo.pe', 'REBOTE_DURO');
        await contactos.marcar('CORREO', 'sha256:ana@ejemplo.pe', 'QUEJA_SPAM');
        expect(await contactos.esInvalido('CORREO', 'sha256:ana@ejemplo.pe')).toBe(true);
      }),
    );
    const otro = await enTenant(tenantId, () => enviar.enviar(comando()));
    expect(otro.estado).toBe('DESCARTADO');
    expect(await dataSource.query('SELECT motivo FROM ntf.contacto_invalido WHERE tenant_id = $1', [tenantId])).toEqual([{ motivo: 'REBOTE_DURO' }]);
  });
});
