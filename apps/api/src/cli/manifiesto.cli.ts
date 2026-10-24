import { readFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import { DomainError } from '@vitrina/plataforma/kernel';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import {
  DefinicionesRepositorioTypeOrm,
  ENTIDADES_CFG,
  RegistrarDefiniciones,
  ValidadorEsquemaAjv,
  type EntradaDefiniciones,
  type RepositorioDefiniciones,
  type ResumenDefiniciones,
} from '@vitrina/plataforma/parametros';
import { AplicarManifiesto, ManifiestoRepositorioTypeOrm, type RepositorioManifiestos } from '@vitrina/plataforma/seguridad';

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

/**
 * `pnpm manifiesto:aplicar <archivo.json> [--remoto]` (TR-RF-008 y TR-RF-030). Devuelve el código de salida: 0 si
 * aplicó o no había cambios, 1 si el manifiesto es inválido o falla la base (el pipeline detiene el
 * despliegue). La conexión se abre recién después de validar: un manifiesto inválido no toca la base.
 */
export async function aplicarManifiestoCli(args: readonly string[], env: NodeJS.ProcessEnv, salida: Salida): Promise<number> {
  const remoto = args.includes('--remoto');
  const [ruta] = args.filter((a) => !a.startsWith('--'));
  if (!ruta) {
    salida.error('Uso: manifiesto:aplicar <archivo.json> [--remoto]');
    return 1;
  }
  // Mismo criterio que tools/migrar: local con DATABASE_URL; Supabase solo con --remoto. Escribe catálogo
  // global y roles predefinidos, así que hace falta una conexión dueña de las tablas.
  const variable = remoto ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return 1;
  }
  if (remoto) {
    const { host, pathname } = new URL(url);
    salida.log(`Destino remoto: ${host}${pathname}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(await readFile(ruta, 'utf8'));
  } catch (error) {
    salida.error(`No se pudo leer ${ruta}: ${(error as Error).message}`);
    return 1;
  }

  const dataSource = new DataSource({ type: 'postgres', url, entities: ENTIDADES_CFG });
  const conectar = async (): Promise<DataSource> => (dataSource.isInitialized ? dataSource : dataSource.initialize());
  const repositorio: RepositorioManifiestos = {
    transaccion: async (trabajo) => new ManifiestoRepositorioTypeOrm(await conectar(), { next: uuidV7 }).transaccion(trabajo),
  };
  const definiciones: RepositorioDefiniciones = {
    transaccion: async (trabajo) => new DefinicionesRepositorioTypeOrm(await conectar()).transaccion(trabajo),
  };
  const registrar = new RegistrarDefiniciones(definiciones, new ValidadorEsquemaAjv());
  const entrada = entradaParametros(json);
  try {
    // Los parámetros se validan antes de tocar seg: un defecto inválido rechaza todo el manifiesto (TR-CA-079).
    if (entrada) registrar.validar(entrada);
    const resultado = await new AplicarManifiesto(repositorio).ejecutar(json);
    // Transacción propia después de seg (cfg.parametro_def apunta a seg.producto). Repetir el CLI completa.
    const parametros: ResumenDefiniciones = entrada ? await registrar.ejecutar(entrada) : { insertadas: 0, actualizadas: 0, obsoletas: 0, reactivadas: 0 };
    salida.log(JSON.stringify({ ...resultado, parametros }));
    return 0;
  } catch (error) {
    // Sin stack ni la URL: el mensaje de dominio ya nombra lo inválido (TR-CA-024).
    salida.error(error instanceof DomainError ? `${error.code}: ${error.message}` : `Error al aplicar el manifiesto: ${(error as Error).message}`);
    return 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

/** Sin producto o sin arreglo de parámetros no hay nada que validar aquí: AplicarManifiesto informa el error. */
function entradaParametros(json: unknown): EntradaDefiniciones | null {
  const raiz = json as Record<string, unknown> | null;
  if (typeof raiz?.producto_codigo !== 'string' || !Array.isArray(raiz.parametros)) return null;
  return { productoCodigo: raiz.producto_codigo, parametros: raiz.parametros };
}
