import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import {
  AbrirPeriodoCuotas,
  ENTIDADES_IDN,
  esPeriodoValido,
  periodoDe,
  registrarEsquemasIdn,
  type Periodo,
  type ResultadoAperturaCuotas,
} from '@vitrina/plataforma/identidad';
import { CLOCK, InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_ORG } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { CuotasModule } from '../cuotas/cuotas.module.js';

const USO = 'Uso: cuotas:abrir [--periodo AAAA-MM] [--remoto]';
// La caché de parámetros conecta con el primer uso; sin Redis, ParametroPort cae a la base con un aviso.
const REDIS_POR_DEFECTO = 'redis://127.0.0.1:6379';

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

export interface Apertura {
  ejecutar(periodo: Periodo): Promise<ResultadoAperturaCuotas>;
  /** El mes actual en Lima, con el reloj de la app. */
  periodoActual(): Periodo;
  cerrar(): Promise<void>;
}

/**
 * `pnpm cuotas:abrir [--periodo AAAA-MM] [--remoto]` (spec 29): la apertura mensual de cuotas una vez, sin BullMQ.
 * Devuelve el código de salida: 0 si terminó (aunque algún tenant haya fallado y quede en el log), 1 si faltan
 * datos o la tarea no pudo correr.
 */
export async function ejecutarCuotasCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirApertura: (url: string, redisUrl: string) => Promise<Apertura> = abrirAperturaNest,
): Promise<number> {
  const posicionPeriodo = args.indexOf('--periodo');
  const periodoPedido = posicionPeriodo >= 0 ? args[posicionPeriodo + 1] : undefined;
  if (posicionPeriodo >= 0 && !(periodoPedido && esPeriodoValido(periodoPedido))) {
    salida.error(USO);
    return 1;
  }
  // Mismo criterio que los demás CLI: local con DATABASE_URL; Supabase solo con --remoto.
  const variable = args.includes('--remoto') ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return 1;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);

  let apertura: Apertura | null = null;
  try {
    apertura = await abrirApertura(url, env.REDIS_URL ?? REDIS_POR_DEFECTO);
    salida.log(JSON.stringify(await apertura.ejecutar(periodoPedido ?? apertura.periodoActual())));
    return 0;
  } catch (error) {
    salida.error(`Error al abrir las cuotas: ${(error as Error).message}`);
    return 1;
  } finally {
    await apertura?.cerrar();
  }
}

@Module({})
class AperturaModule {
  static register(dataSource: DataSource, redisUrl: string): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasIdn(validator);
    return {
      module: AperturaModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        // Sin BullMQ: no programa, solo provee AbrirPeriodoCuotas.
        CuotasModule.register({ dataSource, redisUrl, programar: false }),
      ],
    };
  }
}

async function abrirAperturaNest(url: string, redisUrl: string): Promise<Apertura> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_IDN, ...ENTIDADES_ORG, ...ENTIDADES_CFG] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(AperturaModule.register(dataSource, redisUrl));
  const abrir = app.get(AbrirPeriodoCuotas);
  const reloj = app.get(CLOCK);
  return {
    ejecutar: (periodo) => abrir.ejecutar(periodo),
    periodoActual: () => periodoDe(reloj.now()),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
