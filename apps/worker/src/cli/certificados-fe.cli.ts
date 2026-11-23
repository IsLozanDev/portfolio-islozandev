import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AvisarCertificadosPorVencer, ENTIDADES_FE, registrarEsquemasFe, type ResultadoAvisos } from '@vitrina/plataforma/comprobantes';
import { CLOCK, InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import { fechaCalendarioDe, type FechaCalendario } from '@vitrina/plataforma/org';
import { ENTIDADES_CFG } from '@vitrina/plataforma/parametros';
import { CertificadosFeModule } from '../certificados-fe/certificados-fe.module.js';

const USO = 'Uso: fe:avisos:ejecutar [--fecha AAAA-MM-DD] [--remoto]';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SALIDA_CORRECTA = 0;
const SALIDA_CON_ERROR = 1;
// La caché de parámetros conecta con el primer uso; sin Redis, ParametroPort cae a la base con un aviso.
const REDIS_POR_DEFECTO = 'redis://127.0.0.1:6379';

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

export interface Avisador {
  ejecutar(fecha: FechaCalendario): Promise<ResultadoAvisos>;
  /** Hoy en Lima, con el reloj de la app. */
  hoy(): FechaCalendario;
  cerrar(): Promise<void>;
}

/**
 * `pnpm fe:avisos:ejecutar [--fecha AAAA-MM-DD] [--remoto]` (spec 49): la tarea diaria de certificados por vencer
 * una vez, sin BullMQ. Devuelve el código de salida: 0 si terminó (aunque algún emisor haya fallado y quede en el
 * log), 1 si faltan datos o la tarea no pudo correr.
 */
export async function ejecutarAvisosFeCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirAvisador: (url: string, redisUrl: string) => Promise<Avisador> = abrirAvisadorNest,
): Promise<number> {
  const posicionFecha = args.indexOf('--fecha');
  const fechaPedida = posicionFecha >= 0 ? args[posicionFecha + 1] : undefined;
  if (posicionFecha >= 0 && !(fechaPedida && FECHA.test(fechaPedida))) {
    salida.error(USO);
    return SALIDA_CON_ERROR;
  }
  // Mismo criterio que los otros CLI: local con DATABASE_URL; Supabase solo con --remoto.
  const variableUrl = args.includes('--remoto') ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variableUrl];
  if (!url) {
    salida.error(`Falta ${variableUrl}. Copia .env.example a .env.`);
    return SALIDA_CON_ERROR;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);

  let avisador: Avisador | null = null;
  try {
    avisador = await abrirAvisador(url, env.REDIS_URL ?? REDIS_POR_DEFECTO);
    salida.log(JSON.stringify(await avisador.ejecutar(fechaPedida ?? avisador.hoy())));
    return SALIDA_CORRECTA;
  } catch (error) {
    // Solo el nombre: el mensaje del driver puede traer la URL.
    salida.error(`Error al avisar certificados por vencer: ${(error as Error).name}`);
    return SALIDA_CON_ERROR;
  } finally {
    await avisador?.cerrar();
  }
}

@Module({})
class AvisosFeModule {
  static register(dataSource: DataSource, redisUrl: string): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasFe(validator);
    return {
      module: AvisosFeModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        // Sin BullMQ: no programa, solo provee AvisarCertificadosPorVencer.
        CertificadosFeModule.register({ dataSource, redisUrl, programar: false }),
      ],
    };
  }
}

async function abrirAvisadorNest(url: string, redisUrl: string): Promise<Avisador> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_FE, ...ENTIDADES_CFG] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(AvisosFeModule.register(dataSource, redisUrl));
  const avisar = app.get(AvisarCertificadosPorVencer);
  const reloj = app.get(CLOCK);
  return {
    ejecutar: (fecha) => avisar.ejecutar(fecha),
    hoy: () => fechaCalendarioDe(reloj.now()),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
