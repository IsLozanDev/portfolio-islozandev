import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';
import {
  camposEntornoSecretos,
  ClaveMaestraInvalidaError,
  clavesMaestrasDe,
  ENTIDADES_SEC,
  ReenvolverClaves,
  SecretosModule,
  type ClavesMaestras,
  type ResultadoReenvoltura,
} from '@vitrina/plataforma/secretos';
import { z } from 'zod';

const CODIGO_OK = 0;
const CODIGO_ERROR = 1;
const OPCION_VERIFICAR = '--verificar';
const OPCION_REMOTO = '--remoto';
const OPCIONES = [OPCION_VERIFICAR, OPCION_REMOTO];
const USO = `Uso: secretos:reenvolver [${OPCION_VERIFICAR}] [${OPCION_REMOTO}]`;
const esquemaSecretos = z.object(camposEntornoSecretos);

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

export interface Reenvolvedor {
  ejecutar(): Promise<ResultadoReenvoltura>;
  contarPendientes(): Promise<number>;
  cerrar(): Promise<void>;
}

export type AbrirReenvolvedor = (url: string, claves: ClavesMaestras) => Promise<Reenvolvedor>;

/**
 * `pnpm secretos:reenvolver [--verificar] [--remoto]` (spec 41): tras activar una clave maestra nueva, re-envuelve con
 * ella las claves de datos de todos los tenants. `--verificar` solo cuenta las pendientes, sin escribir. Termina en 0
 * solo si no queda ninguna: es la condición para retirar la versión vieja.
 */
export async function ejecutarReenvolturaCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrir: AbrirReenvolvedor = abrirReenvolvedorNest,
): Promise<number> {
  if (args.some((argumento) => !OPCIONES.includes(argumento))) {
    salida.error(USO);
    return CODIGO_ERROR;
  }
  // Mismo criterio que los demás CLI: local con DATABASE_URL; Supabase solo con --remoto.
  const variable = args.includes(OPCION_REMOTO) ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return CODIGO_ERROR;
  }
  const claves = leerClaves(env, salida);
  if (!claves) return CODIGO_ERROR;
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname} · clave maestra activa: ${claves.activa}`);

  let reenvolvedor: Reenvolvedor | null = null;
  try {
    reenvolvedor = await abrir(url, claves);
    const pendientes = args.includes(OPCION_VERIFICAR) ? await verificarPendientes(reenvolvedor, salida) : await reenvolverTodo(reenvolvedor, salida);
    return pendientes === 0 ? CODIGO_OK : CODIGO_ERROR;
  } catch (error) {
    salida.error(`Error al re-envolver las claves: ${(error as Error).name}`);
    return CODIGO_ERROR;
  } finally {
    await reenvolvedor?.cerrar();
  }
}

/** Ningún mensaje lleva una clave: solo el nombre de la variable o el motivo. */
function leerClaves(env: NodeJS.ProcessEnv, salida: Salida): ClavesMaestras | null {
  const entorno = esquemaSecretos.safeParse(env);
  if (!entorno.success) {
    salida.error(`Variables inválidas: ${entorno.error.issues.map((problema) => problema.path.join('.')).join(', ')}`);
    return null;
  }
  try {
    const claves = clavesMaestrasDe(entorno.data);
    if (claves) return claves;
    salida.error('Faltan SEC_CLAVES_MAESTRAS y SEC_CLAVE_ACTIVA');
  } catch (error) {
    if (!(error instanceof ClaveMaestraInvalidaError)) throw error;
    salida.error(`SEC_CLAVES_MAESTRAS inválida: ${error.message}`);
  }
  return null;
}

async function verificarPendientes(reenvolvedor: Reenvolvedor, salida: Salida): Promise<number> {
  const pendientes = await reenvolvedor.contarPendientes();
  salida.log(`Claves pendientes de re-envolver: ${pendientes}`);
  return pendientes;
}

async function reenvolverTodo(reenvolvedor: Reenvolvedor, salida: Salida): Promise<number> {
  const resultado = await reenvolvedor.ejecutar();
  salida.log(JSON.stringify(resultado));
  return resultado.pendientes;
}

@Module({})
class ReenvolturaCliModule {
  static register(dataSource: DataSource, claves: ClavesMaestras): DynamicModule {
    return {
      module: ReenvolturaCliModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator: new InMemoryEventSchemaValidator() }),
        SecretosModule.registrarReenvoltura({ claves, dataSource }),
      ],
    };
  }
}

async function abrirReenvolvedorNest(url: string, claves: ClavesMaestras): Promise<Reenvolvedor> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_SEC] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(ReenvolturaCliModule.register(dataSource, claves), { logger: ['error', 'warn'] });
  const reenvolver = app.get(ReenvolverClaves);
  return {
    ejecutar: () => reenvolver.ejecutar(),
    contarPendientes: () => reenvolver.contarPendientes(),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
