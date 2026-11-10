import type { Clock } from '@vitrina/plataforma/kernel';
import type { TenantsConEventos } from './ports/registro-verificaciones.port.js';
import type { VerificarIntegridad } from './verificar-integridad.js';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasVerificacionDiaria {
  tenants: TenantsConEventos;
  verificar: Pick<VerificarIntegridad, 'ejecutar'>;
  reloj: Clock;
  informar: Informar;
  avisar: Informar;
}

export interface ResultadoVerificacionDiaria {
  tenants: number;
  ok: number;
  rotas: number;
  fallidos: number;
  duracionMs: number;
}

/**
 * La tarea diaria: verificación incremental de cada tenant con filas, uno tras otro. El error técnico de un
 * tenant se loguea con el nombre del error y no detiene a los demás (spec 20b).
 */
export class VerificarTodosLosTenants {
  constructor(private readonly dependencias: DependenciasVerificacionDiaria) {}

  async ejecutar(): Promise<ResultadoVerificacionDiaria> {
    const { tenants, verificar, reloj, informar, avisar } = this.dependencias;
    const inicio = reloj.now().getTime();
    const resultado: ResultadoVerificacionDiaria = { tenants: 0, ok: 0, rotas: 0, fallidos: 0, duracionMs: 0 };

    for (const tenantId of await tenants.listar()) {
      resultado.tenants += 1;
      try {
        const verificacion = await verificar.ejecutar(tenantId, 'INCREMENTAL');
        if (verificacion?.estado === 'ROTA') resultado.rotas += 1;
        else resultado.ok += 1;
      } catch (error) {
        resultado.fallidos += 1;
        avisar('aud.verificacion.error', { tenant_id: tenantId, error: error instanceof Error ? error.name : typeof error });
      }
    }

    resultado.duracionMs = reloj.now().getTime() - inicio;
    informar('aud.verificacion.terminada', { ...resultado });
    return resultado;
  }
}
