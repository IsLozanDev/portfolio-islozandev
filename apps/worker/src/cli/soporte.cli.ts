import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { ENTIDADES_SEG_LECTURA, ENTIDADES_SEG_SOPORTE, registrarEsquemasSeg, VencerAccesosSoporte, type ResultadoVencimientoSoporte } from '@vitrina/plataforma/seguridad';
import { SoporteModule } from '../soporte/soporte.module.js';
import type { Salida } from './vencimientos.cli.js';

/** Sin BullMQ no hace falta Redis ni un intervalo: el CLI corre una vez. */
const SIN_INTERVALO = 0;
const SIN_REDIS = '';

export interface VencedorSoporte {
  ejecutar(): Promise<ResultadoVencimientoSoporte>;
  cerrar(): Promise<void>;
}

/**
 * `pnpm soporte:vencer [--remoto]` (spec 18): la tarea de vencimiento de soporte una vez, sin BullMQ.
 * Devuelve el código de salida: 0 si terminó (aunque algún acceso haya fallado y quede en el log), 1 si
 * faltan datos o la tarea no pudo correr.
 */
export async function ejecutarVencimientoSoporteCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirVencedor: (url: string) => Promise<VencedorSoporte> = abrirVencedorNest,
): Promise<number> {
  // Mismo criterio que vencimientos:ejecutar: local con DATABASE_URL; Supabase solo con --remoto.
  const variable = args.includes('--remoto') ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return 1;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);

  let vencedor: VencedorSoporte | null = null;
  try {
    vencedor = await abrirVencedor(url);
    salida.log(JSON.stringify(await vencedor.ejecutar()));
    return 0;
  } catch (error) {
    salida.error(`Error al vencer accesos de soporte: ${(error as Error).message}`);
    return 1;
  } finally {
    await vencedor?.cerrar();
  }
}

@Module({})
class VencimientoSoporteCliModule {
  static register(dataSource: DataSource): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasSeg(validator);
    return {
      module: VencimientoSoporteCliModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        SoporteModule.register({ dataSource, redisUrl: SIN_REDIS, cadaMs: SIN_INTERVALO, programar: false }),
      ],
    };
  }
}

async function abrirVencedorNest(url: string): Promise<VencedorSoporte> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_SEG_LECTURA, ...ENTIDADES_SEG_SOPORTE] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(VencimientoSoporteCliModule.register(dataSource));
  const vencer = app.get(VencerAccesosSoporte);
  return {
    ejecutar: () => vencer.ejecutar(),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
