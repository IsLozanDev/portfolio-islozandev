import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { AlmacenArchivos } from './ports/almacen-archivos.js';
import type { CargaPendiente, CargasPendientes } from './ports/cargas-pendientes.js';
import type { RepositorioArchivos } from './ports/repositorio-archivos.js';

export interface DependenciasLimpieza {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  archivos: RepositorioArchivos;
  almacen: AlmacenArchivos;
  cargasPendientes: CargasPendientes;
}

export interface ResultadoLimpieza {
  borradas: number;
  /** Cargas que no se pudieron borrar: quedan para la siguiente corrida. */
  fallidas: number;
}

/** Una URL de carga vale 2 horas: a las 24 nadie va a confirmar ya esa carga. */
const HORAS_HASTA_VENCER = 24;
const MILISEGUNDOS_POR_HORA = 60 * 60 * 1000;
const TAMANO_LOTE = 200;

/**
 * Tarea diaria del worker: borra las cargas que llevan más de 24 horas en `PENDIENTE_CARGA` (el cliente
 * nunca subió o nunca confirmó). Primero el objeto y después la fila, con el contexto del tenant de cada
 * carga. No toca archivos en otro estado.
 */
export class LimpiarCargasPendientes {
  constructor(private readonly dependencias: DependenciasLimpieza) {}

  async ejecutar(): Promise<ResultadoLimpieza> {
    const { reloj, cargasPendientes } = this.dependencias;
    const antes = new Date(reloj.now().getTime() - HORAS_HASTA_VENCER * MILISEGUNDOS_POR_HORA);
    const resultado: ResultadoLimpieza = { borradas: 0, fallidas: 0 };
    for (;;) {
      const lote = await cargasPendientes.listarVencidas(antes, TAMANO_LOTE);
      const resultadoDelLote = await this.borrarLote(lote);
      resultado.borradas += resultadoDelLote.borradas;
      resultado.fallidas += resultadoDelLote.fallidas;
      // Un lote sin ningún borrado volvería a salir igual: se corta para no girar sobre las que fallan.
      if (lote.length < TAMANO_LOTE || resultadoDelLote.borradas === 0) return resultado;
    }
  }

  private async borrarLote(lote: CargaPendiente[]): Promise<ResultadoLimpieza> {
    const resultadoDelLote: ResultadoLimpieza = { borradas: 0, fallidas: 0 };
    for (const carga of lote) {
      try {
        if (await this.borrarCarga(carga)) resultadoDelLote.borradas += 1;
      } catch {
        resultadoDelLote.fallidas += 1;
      }
    }
    return resultadoDelLote;
  }

  /** `false` si la carga dejó de estar pendiente entre la lista y el borrado: el cliente confirmó a tiempo. */
  private borrarCarga(carga: CargaPendiente): Promise<boolean> {
    const { unidadDeTrabajo, contexto, archivos, almacen } = this.dependencias;
    return contexto.run({ tenantId: carga.tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const archivo = await archivos.obtener(carga.archivoId);
        if (!archivo || archivo.estado !== 'PENDIENTE_CARGA') return false;
        await almacen.borrar(archivo.primeraVersion.rutaStorage);
        await archivos.eliminar(archivo.id);
        return true;
      }),
    );
  }
}
