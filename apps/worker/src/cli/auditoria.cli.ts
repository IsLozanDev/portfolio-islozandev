import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AuditoriaModule, ENTIDADES_AUDITORIA, registrarEsquemasAud, VerificarIntegridad, type Verificacion } from '@vitrina/plataforma/auditoria';
import { InMemoryEventSchemaValidator, KernelInfraModule } from '@vitrina/plataforma/kernel-infra';

const USO = 'Uso: auditoria:verificar --tenant <uuid> [--completa] [--remoto]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_OK = 0;
const CODIGO_ERROR = 1;

export interface Salida {
  log(mensaje: string): void;
  error(mensaje: string): void;
}

export interface Verificador {
  ejecutar(tenantId: string, completa: boolean): Promise<Verificacion | null>;
  cerrar(): Promise<void>;
}

/**
 * `pnpm auditoria:verificar --tenant <uuid> [--completa] [--remoto]` (spec 20b): la verificación de un tenant,
 * sin BullMQ. `--completa` recorre la cadena desde el inicio. Devuelve 1 si la cadena queda ROTA, si faltan
 * datos o si no pudo correr; 0 si quedó OK o el tenant no tiene filas.
 */
export async function ejecutarAuditoriaCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirVerificador: (url: string) => Promise<Verificador> = abrirVerificadorNest,
): Promise<number> {
  const posicionTenant = args.indexOf('--tenant');
  const tenantId = posicionTenant >= 0 ? args[posicionTenant + 1] : undefined;
  if (!tenantId || !UUID.test(tenantId)) {
    salida.error(USO);
    return CODIGO_ERROR;
  }
  // Mismo criterio que los demás CLI: local con DATABASE_URL; Supabase solo con --remoto.
  const variable = args.includes('--remoto') ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return CODIGO_ERROR;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);

  let verificador: Verificador | null = null;
  try {
    verificador = await abrirVerificador(url);
    const verificacion = await verificador.ejecutar(tenantId, args.includes('--completa'));
    if (!verificacion) {
      salida.log('El tenant no tiene filas de auditoría');
      return CODIGO_OK;
    }
    salida.log(JSON.stringify(verificacion));
    return verificacion.estado === 'ROTA' ? CODIGO_ERROR : CODIGO_OK;
  } catch (error) {
    salida.error(`Error al verificar la auditoría: ${(error as Error).name}`);
    return CODIGO_ERROR;
  } finally {
    await verificador?.cerrar();
  }
}

@Module({})
class VerificacionCliModule {
  static register(dataSource: DataSource): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasAud(validator);
    return {
      module: VerificacionCliModule,
      imports: [KernelInfraModule.register({ dataSource, validator }), AuditoriaModule.registrarVerificacion(dataSource)],
    };
  }
}

async function abrirVerificadorNest(url: string): Promise<Verificador> {
  const dataSource = new DataSource({ type: 'postgres', url, entities: [...ENTIDADES_AUDITORIA] });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(VerificacionCliModule.register(dataSource), { logger: ['error', 'warn'] });
  const verificar = app.get(VerificarIntegridad);
  return {
    ejecutar: (tenantId, completa) => verificar.ejecutar(tenantId, completa ? 'COMPLETA' : 'INCREMENTAL'),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
