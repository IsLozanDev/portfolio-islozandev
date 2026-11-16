import type { Clock, UnitOfWork } from '@vitrina/plataforma/kernel';
import { periodoDe, type Periodo } from '../domain/periodo.js';
import type { LecturaCuotasConsola, PaginaCuotasConsola, VerificadorOperador } from './ports/cuotas.js';

export interface DependenciasConsolaCuotas {
  unidadDeTrabajo: UnitOfWork;
  reloj: Clock;
  verificador: VerificadorOperador;
  lectura: LecturaCuotasConsola;
}

export interface ConsultaCuotas {
  /** Por defecto, el mes actual en Lima. */
  periodo?: Periodo;
  q?: string;
  /** Desde 1. */
  pagina: number;
  tamano: number;
}

/** Operador: las cuotas de todos los tenants en un periodo, de mayor a menor consumo. */
export class ListarCuotas {
  constructor(private readonly dependencias: DependenciasConsolaCuotas) {}

  async ejecutar({ periodo, q, pagina, tamano }: ConsultaCuotas): Promise<PaginaCuotasConsola & { periodo: Periodo }> {
    const { unidadDeTrabajo, reloj, verificador, lectura } = this.dependencias;
    await verificador.exigir();
    const periodoPedido = periodo ?? periodoDe(reloj.now());
    const filtro = { periodo: periodoPedido, q, limite: tamano, desplazamiento: (pagina - 1) * tamano };
    const resultado = await unidadDeTrabajo.run(() => lectura.delPeriodo(filtro));
    return { ...resultado, periodo: periodoPedido };
  }
}
