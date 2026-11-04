import type { Clock, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { liberarAgente } from './cerrar-acceso-soporte.js';
import type { RepositorioAccesosSoporte } from './ports/acceso-soporte.repositorio.js';
import type { AccesoPorVencer, LecturaSoporte } from './ports/lectura-soporte.js';
import type { BitacoraSeguridad, RepositorioAsignaciones, RepositorioMembresias } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

/** Motivo con el que el sistema finaliza la membresía y revoca la asignación del agente al vencer. */
export const MOTIVO_VENCIMIENTO_SOPORTE = 'Acceso de soporte vencido';

type Informar = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasVencimientoSoporte {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  eventos: EventPublisher;
  lectura: Pick<LecturaSoporte, 'porVencer'>;
  accesos: RepositorioAccesosSoporte;
  membresias: RepositorioMembresias;
  asignaciones: RepositorioAsignaciones;
  bitacora: BitacoraSeguridad;
  avisar: Informar;
}

export interface ResultadoVencimientoSoporte {
  vencidos: number;
  fallidos: number;
}

/**
 * Lo corre el worker cada minuto (spec 18). `membresia.hasta` ya cortó el acceso al instante: esto deja
 * el estado EXPIRADO, finaliza la membresía, revoca la asignación (sube `vt`) y caduca las pendientes de
 * 24 h. Un acceso por transacción, en su tenant: un fallo no frena a los demás. Idempotente.
 */
export class VencerAccesosSoporte {
  constructor(private readonly dependencias: DependenciasVencimientoSoporte) {}

  async ejecutar(): Promise<ResultadoVencimientoSoporte> {
    const { lectura, reloj, avisar } = this.dependencias;
    const ahora = reloj.now();
    const resultado = { vencidos: 0, fallidos: 0 };
    for (const porVencer of await lectura.porVencer(ahora)) {
      try {
        if (await this.vencer(porVencer, ahora)) resultado.vencidos += 1;
      } catch (error) {
        resultado.fallidos += 1;
        // Solo ids y el tipo de error: sin datos personales (TR-RNF-026).
        avisar('No se pudo vencer un acceso de soporte', {
          evento: 'seg.soporte.vencimiento_falla',
          acceso_id: porVencer.id,
          tenant_id: porVencer.tenantId,
          error: error instanceof Error ? error.name : typeof error,
        });
      }
    }
    return resultado;
  }

  private vencer({ id, tenantId }: AccesoPorVencer, ahora: Date): Promise<boolean> {
    const { contexto, unidadDeTrabajo, accesos, bitacora, eventos } = this.dependencias;
    return contexto.run({ tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const acceso = await accesos.buscar(id);
        // Otro proceso lo cerró entre la lectura y esta transacción.
        if (!acceso || !acceso.vencible(ahora)) return false;
        const estadoAnterior = acceso.estado;
        acceso.expirar(ahora);
        await accesos.guardar(acceso);
        if (estadoAnterior === 'APROBADO') await liberarAgente(this.dependencias, acceso, MOTIVO_VENCIMIENTO_SOPORTE, null, ahora);
        await bitacora.registrar('ACCESO_SOPORTE', null, { accion: 'EXPIRADO', acceso_id: acceso.id, ticket: acceso.ticket, estado_anterior: estadoAnterior });
        await publicarEventos(eventos, acceso);
        return true;
      }),
    );
  }
}
