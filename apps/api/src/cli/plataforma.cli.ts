import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { DomainError } from '@vitrina/plataforma/kernel';
import { ID_GENERATOR, InMemoryEventSchemaValidator, KernelInfraModule, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { CrearTenant, OrgModule, RegistrarEmpresa, registrarEsquemasOrg } from '@vitrina/plataforma/org';
import { InvitarPropietario, registrarEsquemasSeg, SeguridadModule } from '@vitrina/plataforma/seguridad';
import { validarRuc } from '@vitrina/shared/util';
import { z } from 'zod';
import { SembrarPlataforma, type ResultadoSiembra, type SembrarPlataformaComando } from '../org/sembrar-plataforma.js';
import { TenantsPorCodigoTypeOrm } from '../org/tenants-por-codigo.typeorm.js';
import type { Salida } from './manifiesto.cli.js';

const USO = 'Uso: plataforma:sembrar <correo> [--nombre <nombre>] [--remoto]';
const NOMBRE_POR_DEFECTO = 'Administrador de plataforma';
const MFA_MAX_EDAD_SEG = 900;
// El CLI no usa la caché de permisos: el cliente Redis de seguridad se crea sin conectarse.
const REDIS_SIN_USO = 'redis://127.0.0.1:6379';

const EsquemaEntorno = z.object({
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SEG_URL_INVITACION: z.url({ protocol: /^https?$/ }),
  SEG_INVITACION_HORAS: z.coerce.number().int().positive().default(72),
  ORG_TENANT_OPERADOR: z.string().min(3).max(30).default('plataforma'),
  ORG_OPERADOR_RUC: z.string().refine(validarRuc),
});

export type EntornoSiembra = z.infer<typeof EsquemaEntorno> & { url: string };

export interface Sembrador {
  ejecutar(comando: SembrarPlataformaComando): Promise<ResultadoSiembra>;
  cerrar(): Promise<void>;
}

/**
 * `pnpm plataforma:sembrar <correo> [--nombre <nombre>] [--remoto]` (spec 12). Devuelve el código de salida: 0 si
 * sembró o no había nada que hacer, 1 si faltan datos o falla. Nunca imprime el token ni la URL completa.
 */
export async function sembrarPlataformaCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  salida: Salida,
  abrirSembrador: (entorno: EntornoSiembra) => Promise<Sembrador> = abrirSembradorNest,
): Promise<number> {
  const { correo, nombre, remoto } = leerArgumentos(args);
  if (!correo) {
    salida.error(USO);
    return 1;
  }
  // Mismo criterio que manifiesto:aplicar: local con DATABASE_URL; Supabase solo con --remoto.
  const variable = remoto ? 'DATABASE_MIGRATION_URL' : 'DATABASE_URL';
  const url = env[variable];
  if (!url) {
    salida.error(`Falta ${variable}. Copia .env.example a .env.`);
    return 1;
  }
  const entorno = EsquemaEntorno.safeParse(env);
  if (!entorno.success) {
    // Solo las rutas: el mensaje de zod puede arrastrar el valor de la secret key.
    salida.error(`Variables de entorno inválidas: ${entorno.error.issues.map((problema) => problema.path.join('.')).join(', ')}`);
    return 1;
  }
  const { host, pathname } = new URL(url);
  salida.log(`Destino: ${host}${pathname}`);

  let sembrador: Sembrador | null = null;
  try {
    sembrador = await abrirSembrador({ ...entorno.data, url });
    salida.log(JSON.stringify(resumen(await sembrador.ejecutar({ correo, nombre }))));
    return 0;
  } catch (error) {
    salida.error(error instanceof DomainError ? `${error.code}: ${error.message}` : `Error al sembrar la plataforma: ${(error as Error).message}`);
    return 1;
  } finally {
    await sembrador?.cerrar();
  }
}

function leerArgumentos(args: readonly string[]): { correo: string | undefined; nombre: string; remoto: boolean } {
  const posicionNombre = args.indexOf('--nombre');
  const posicionValorNombre = posicionNombre >= 0 ? posicionNombre + 1 : -1;
  const nombre = posicionValorNombre >= 0 ? args[posicionValorNombre] : undefined;
  const correo = args.find((argumento, indice) => !argumento.startsWith('--') && indice !== posicionValorNombre);
  return { correo, nombre: nombre ?? NOMBRE_POR_DEFECTO, remoto: args.includes('--remoto') };
}

/** Sin el token ni el correo: los ids bastan para seguir el resultado. */
function resumen(resultado: ResultadoSiembra): Record<string, unknown> {
  if (resultado.sinCambios) return { sin_cambios: true, tenant_id: resultado.tenantId };
  return {
    sin_cambios: false,
    tenant_id: resultado.tenantId,
    tenant_creado: resultado.tenantCreado,
    membresia_id: resultado.membresiaId,
    usuario_nuevo: resultado.usuarioNuevo,
    correo_enviado: resultado.correoEnviado,
  };
}

@Module({})
class SiembraModule {
  static register(entorno: EntornoSiembra, dataSource: DataSource): DynamicModule {
    const validator = new InMemoryEventSchemaValidator();
    registrarEsquemasOrg(validator);
    registrarEsquemasSeg(validator);
    return {
      module: SiembraModule,
      imports: [
        KernelInfraModule.register({ dataSource, validator }),
        OrgModule,
        SeguridadModule.register({
          dataSource,
          supabaseUrl: entorno.SUPABASE_URL,
          mfaMaxEdadSeg: MFA_MAX_EDAD_SEG,
          redisUrl: REDIS_SIN_USO,
          invitaciones: { supabaseSecretKey: entorno.SUPABASE_SECRET_KEY, url: entorno.SEG_URL_INVITACION, horas: entorno.SEG_INVITACION_HORAS },
        }),
      ],
    };
  }
}

async function abrirSembradorNest(entorno: EntornoSiembra): Promise<Sembrador> {
  const dataSource = new DataSource({ type: 'postgres', url: entorno.url });
  await dataSource.initialize();
  const app = await NestFactory.createApplicationContext(SiembraModule.register(entorno, dataSource), { logger: false });
  const sembrador = new SembrarPlataforma({
    unidadDeTrabajo: app.get(TypeOrmUnitOfWork),
    contexto: app.get(TENANT_CONTEXT),
    ids: app.get(ID_GENERATOR),
    tenantsPorCodigo: new TenantsPorCodigoTypeOrm(dataSource),
    crearTenant: app.get(CrearTenant),
    registrarEmpresa: app.get(RegistrarEmpresa),
    invitarPropietario: app.get(InvitarPropietario),
    tenantOperador: entorno.ORG_TENANT_OPERADOR,
    rucOperador: entorno.ORG_OPERADOR_RUC,
  });
  return {
    ejecutar: (comando) => sembrador.ejecutar(comando),
    cerrar: async () => {
      await app.close();
      await dataSource.destroy();
    },
  };
}
