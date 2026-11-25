import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AUDITORIA } from '@vitrina/plataforma/auditoria';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import {
  camposEntornoNotificaciones,
  ENTIDADES_NOT,
  NOTIFICACION_PORT,
  NotificacionesModule,
  registrarEsquemasNot,
  type EntornoNotificaciones,
  type NotificacionPort,
} from '@vitrina/plataforma/notificaciones';
import { CONSENTIMIENTO_PORT, PERSONA_PORT } from '@vitrina/plataforma/personas';

const USO = 'Uso: notificaciones:probar --tenant <uuid> --correo <dirección> [--remoto]';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CODIGO_OK = 0;
export const CODIGO_ERROR = 1;
export const PLANTILLA_PRUEBA = 'PRUEBA_CORREO';
export const VARIABLES_PRUEBA = { nombre: 'equipo', producto: 'Vitrina' };
/** Lo que espera el CLI a que el worker entregue el mensaje (TR-CA-187: menos de 30 s). */
export const ESPERA_MAXIMA_MS = 30_000;
const CADA_MS = 2_000;
const ESTADOS_ENTREGADOS = new Set(['ENVIADO', 'ENTREGADO', 'LEIDO']);
const ESTADOS_FINALES = new Set([...ESTADOS_ENTREGADOS, 'FALLIDO', 'OMITIDO_SIN_CONSENTIMIENTO', 'DESCARTADO']);
const ENTIDAD_MENSAJE = 'MensajeNotificacion';

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

export interface Probador {
  enviar(tenantId: string, correo: string): Promise<{ mensajeId: string; estado: string }>;
  estado(tenantId: string, mensajeId: string): Promise<string | null>;
  cerrar(): Promise<void>;
}

export interface OpcionesEspera {
  esperaMaximaMs: number;
  cadaMs: number;
}

/**
 * `pnpm notificaciones:probar --tenant <uuid> --correo <dir> [--remoto]` (spec 42): envía `PRUEBA_CORREO` por
 * `NotificacionPort` (outbox, cola y Resend, con el worker en marcha) e imprime el id del mensaje y su estado
 * final tras esperar hasta 30 s. Devuelve 0 si el mensaje salió (ENVIADO o después).
 */
export async function ejecutarNotificacionesCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirProbador: (url: string, entorno: EntornoNotificaciones) => Promise<Probador> = abrirProbadorNest,
  espera: OpcionesEspera = { esperaMaximaMs: ESPERA_MAXIMA_MS, cadaMs: CADA_MS },
): Promise<number> {
  const tenantId = valorDe(args, '--tenant');
  const correo = valorDe(args, '--correo');
  if (!tenantId || !UUID.test(tenantId) || !correo) {
    salida.error(USO);
    return CODIGO_ERROR;
  }
  const url = urlDeBaseDatos(args, env, salida);
  if (!url) return CODIGO_ERROR;

  let probador: Probador | null = null;
  try {
    probador = await abrirProbador(url, z.object(camposEntornoNotificaciones).parse(env));
    const registrada = await probador.enviar(tenantId, correo);
    salida.log(`Mensaje ${registrada.mensajeId}: ${registrada.estado}`);
    const final = await esperarEstadoFinal(probador, tenantId, registrada.mensajeId, espera);
    salida.log(`Estado tras la espera: ${final ?? 'desconocido'}`);
    return final !== null && ESTADOS_ENTREGADOS.has(final) ? CODIGO_OK : CODIGO_ERROR;
  } catch (error) {
    // Solo el nombre: el mensaje puede traer la URL o el correo (TR-RNF-026).
    salida.error(`Error al probar la notificación: ${(error as Error).name}`);
    return CODIGO_ERROR;
  } finally {
    await probador?.cerrar();
  }
}

export function valorDe(args: readonly string[], opcion: string): string | undefined {
  const posicion = args.indexOf(opcion);
  return posicion >= 0 ? args[posicion + 1] : undefined;
}

/** Mismo criterio que los demás CLI: local con DATABASE_URL; Supabase solo con --remoto. Imprime el destino sin la clave. */
export function urlDeBaseDatos(args: readonly string[], env: NodeJS.ProcessEnv, salida: Salida): string | null {
  const variable = args.includes('--remoto') ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return null;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);
  return url;
}

async function esperarEstadoFinal(probador: Probador, tenantId: string, mensajeId: string, espera: OpcionesEspera): Promise<string | null> {
  const limite = Date.now() + espera.esperaMaximaMs;
  let estado = await probador.estado(tenantId, mensajeId);
  while ((estado === null || !ESTADOS_FINALES.has(estado)) && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, espera.cadaMs));
    estado = await probador.estado(tenantId, mensajeId);
  }
  return estado;
}

/** El CLI envía solo a un correo directo: TR-PER no está en el worker. */
const personaNoDisponible = () => Promise.reject(new Error('TR-PER no está disponible en el CLI de notificaciones'));
/** Solo las plantillas por HTTP auditan (spec 43); el CLI no las usa. */
const auditoriaNoDisponible = () => Promise.reject(new Error('TR-AUD no está disponible en el CLI de notificaciones'));

@Module({
  providers: [
    { provide: PERSONA_PORT, useValue: { obtener: personaNoDisponible } },
    { provide: CONSENTIMIENTO_PORT, useValue: { vigente: personaNoDisponible } },
    { provide: AUDITORIA, useValue: { registrar: auditoriaNoDisponible, registrarAccesoSensible: auditoriaNoDisponible } },
  ],
  exports: [PERSONA_PORT, CONSENTIMIENTO_PORT, AUDITORIA],
})
class SinPersonasModule {}

@Module({})
class ProbarNotificacionCliModule {
  static register(dataSource: DataSource, entorno: EntornoNotificaciones): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasNot(validator);
    return {
      module: ProbarNotificacionCliModule,
      imports: [KernelInfraModule.register({ dataSource, validator }), NotificacionesModule.register({ entorno, dataSource, imports: [SinPersonasModule] })],
    };
  }
}

/** NotificacionPort en proceso, sin TR-PER: solo correos directos. También lo usa `notificaciones:programar` (spec 45). */
export interface ContextoNotificacionesCli {
  notificaciones: NotificacionPort;
  contexto: TenantContext;
  unidadDeTrabajo: TypeOrmUnitOfWork;
  cerrar(): Promise<void>;
}

export async function abrirContextoNotificaciones(url: string, entorno: EntornoNotificaciones): Promise<ContextoNotificacionesCli> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_NOT] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(ProbarNotificacionCliModule.register(dataSource, entorno), { logger: ['error', 'warn'] });
  return {
    notificaciones: app.get<NotificacionPort>(NOTIFICACION_PORT),
    contexto: app.get<TenantContext>(TENANT_CONTEXT),
    unidadDeTrabajo: app.get(TypeOrmUnitOfWork),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}

async function abrirProbadorNest(url: string, entorno: EntornoNotificaciones): Promise<Probador> {
  const { notificaciones, contexto, unidadDeTrabajo, cerrar } = await abrirContextoNotificaciones(url, entorno);
  return {
    enviar: (tenantId, correo) =>
      contexto.run({ tenantId }, () =>
        notificaciones.enviar({
          plantilla: PLANTILLA_PRUEBA,
          destinatario: { correo },
          variables: VARIABLES_PRUEBA,
          finalidad: 'TRANSACCIONAL',
          claveIdempotencia: uuidV7(),
        }),
      ),
    estado: (tenantId, mensajeId) =>
      contexto.run({ tenantId }, () =>
        unidadDeTrabajo.run(async () => {
          const fila = await unidadDeTrabajo.manager.getRepository<{ id: string; estado: string }>(ENTIDAD_MENSAJE).findOne({ where: { id: mensajeId }, select: { estado: true } });
          return fila?.estado ?? null;
        }),
      ),
    cerrar,
  };
}
