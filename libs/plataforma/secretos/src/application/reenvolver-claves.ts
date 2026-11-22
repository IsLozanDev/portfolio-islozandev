import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ClavesMaestras } from '../domain/claves-maestras.js';
import type { ClavesDeDatos } from './claves-de-datos.js';
import type { Registrar } from './dependencias-boveda.js';
import type { RepositorioClavesTenant } from './ports/repositorio-claves-tenant.js';
import type { TenantsPorReenvolver } from './ports/tenants-por-reenvolver.js';

export interface DependenciasReenvoltura {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  clavesDeDatos: ClavesDeDatos;
  clavesTenant: RepositorioClavesTenant;
  tenantsPorReenvolver: TenantsPorReenvolver;
  informar: Registrar;
  avisar: Registrar;
}

export interface ResultadoReenvoltura {
  reenvueltas: number;
  /** Claves que siguen con otra versión de maestra: deben ser 0 antes de retirar la versión vieja. */
  pendientes: number;
}

const TAMANO_LOTE = 200;
/** Tope del conteo de pendientes: muy por encima del número de tenants que se espera. */
const LIMITE_CONTEO = 100_000;
const EVENTO_REENVOLTURA = 'sec.claves.reenvueltas';
const EVENTO_FALLO = 'sec.clave.reenvoltura_fallida';

/**
 * Tras activar una clave maestra nueva: por cada tenant con su clave de datos envuelta por otra versión, en una
 * transacción con su contexto, la desenvuelve con la vieja y la envuelve con la activa e IV nuevo. Los secretos no
 * se tocan. Repite lote a lote hasta que no queden o un lote no avance (una versión vieja que ya no está configurada).
 */
export class ReenvolverClaves {
  constructor(private readonly dependencias: DependenciasReenvoltura) {}

  async ejecutar(): Promise<ResultadoReenvoltura> {
    const maestras = this.dependencias.clavesDeDatos.exigirMaestras();
    let reenvueltas = 0;
    for (;;) {
      const lote = await this.dependencias.tenantsPorReenvolver.listar(maestras.activa, TAMANO_LOTE);
      const reenvueltasLote = await this.reenvolverLote(lote, maestras);
      reenvueltas += reenvueltasLote;
      if (lote.length < TAMANO_LOTE || reenvueltasLote === 0) break;
    }
    const pendientes = await this.contarPendientes();
    this.dependencias.informar(EVENTO_REENVOLTURA, { reenvueltas, pendientes, version_activa: maestras.activa });
    return { reenvueltas, pendientes };
  }

  /** `--verificar`: cuenta sin escribir. */
  async contarPendientes(): Promise<number> {
    const { activa } = this.dependencias.clavesDeDatos.exigirMaestras();
    return (await this.dependencias.tenantsPorReenvolver.listar(activa, LIMITE_CONTEO)).length;
  }

  private async reenvolverLote(tenants: string[], maestras: ClavesMaestras): Promise<number> {
    let reenvueltas = 0;
    for (const tenantId of tenants) {
      try {
        if (await this.reenvolverTenant(tenantId, maestras)) reenvueltas += 1;
      } catch (error) {
        // Solo el nombre: ClaveMaestraDesconocidaError dice la versión que falta; ningún error lleva claves.
        this.dependencias.avisar(EVENTO_FALLO, { tenant_id: tenantId, error: error instanceof Error ? error.name : typeof error });
      }
    }
    return reenvueltas;
  }

  private reenvolverTenant(tenantId: string, maestras: ClavesMaestras): Promise<boolean> {
    const { contexto, unidadDeTrabajo, clavesTenant, clavesDeDatos, reloj } = this.dependencias;
    return contexto.run({ tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const clave = await clavesTenant.obtener();
        if (!clave || clave.versionClaveMaestra === maestras.activa) return false;
        const claveDatos = clavesDeDatos.desenvolver(clave);
        await clavesTenant.reenvolver(clavesDeDatos.envolver(tenantId, claveDatos, reloj.now()));
        return true;
      }),
    );
  }
}
