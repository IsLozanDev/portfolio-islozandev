import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { CLOCK, InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_ORG, fechaCalendarioDe, registrarEsquemasOrg, RevisarVencimientos, type FechaCalendario, type ResultadoVencimientos } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { VencimientosModule } from '../vencimientos/vencimientos.module.js';

const USO = 'Uso: vencimientos:ejecutar [--fecha AAAA-MM-DD] [--remoto]';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// La caché de parámetros conecta con el primer uso; sin Redis, ParametroPort cae a la base con un aviso.
const REDIS_POR_DEFECTO = 'redis://127.0.0.1:6379';

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

export interface Revisor {
  ejecutar(fecha: FechaCalendario): Promise<ResultadoVencimientos>;
  /** Hoy en Lima, con el reloj de la app. */
  hoy(): FechaCalendario;
  cerrar(): Promise<void>;
}

/**
 * `pnpm vencimientos:ejecutar [--fecha AAAA-MM-DD] [--remoto]` (TR-RF-007, TR-CA-021): la tarea diaria una vez,
 * sin BullMQ. Devuelve el código de salida: 0 si terminó (aunque algún tenant haya fallado y quede en
 * el log), 1 si faltan datos o la tarea no pudo correr.
 */
export async function ejecutarVencimientosCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirRevisor: (url: string, redisUrl: string) => Promise<Revisor> = abrirRevisorNest,
): Promise<number> {
  const posicionFecha = args.indexOf('--fecha');
  const fechaPedida = posicionFecha >= 0 ? args[posicionFecha + 1] : undefined;
  if (posicionFecha >= 0 && !(fechaPedida && FECHA.test(fechaPedida))) {
    salida.error(USO);
    return 1;
  }
  // Mismo criterio que los CLI de apps/api: local con DATABASE_URL; Supabase solo con --remoto.
  const variable = args.includes('--remoto') ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return 1;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);

  let revisor: Revisor | null = null;
  try {
    revisor = await abrirRevisor(url, env.REDIS_URL ?? REDIS_POR_DEFECTO);
    salida.log(JSON.stringify(await revisor.ejecutar(fechaPedida ?? revisor.hoy())));
    return 0;
  } catch (error) {
    salida.error(`Error al revisar vencimientos: ${(error as Error).message}`);
    return 1;
  } finally {
    await revisor?.cerrar();
  }
}

@Module({})
class RevisionModule {
  static register(dataSource: DataSource, redisUrl: string): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    return {
      module: RevisionModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        // Sin BullMQ: no programa, solo provee RevisarVencimientos.
        VencimientosModule.register({ dataSource, redisUrl, programar: false }),
      ],
    };
  }
}

async function abrirRevisorNest(url: string, redisUrl: string): Promise<Revisor> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_ORG, ...ENTIDADES_CFG] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(RevisionModule.register(dataSource, redisUrl));
  const revisar = app.get(RevisarVencimientos);
  const reloj = app.get(CLOCK);
  return {
    ejecutar: (fecha) => revisar.ejecutar(fecha),
    hoy: () => fechaCalendarioDe(reloj.now()),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
