import { NotFoundError, type UnitOfWork } from '@vitrina/plataforma/kernel';
import type { Fecha } from '../domain/asignacion.js';
import { RangoBitacoraInvalidoError } from '../domain/errores.js';
import type { EventoBitacora, EventoBitacoraDetalle, FiltroBitacora, LecturaBitacora } from './ports/lectura-bitacora.js';
import type { Listado, Pagina } from './ports/lectura-miembros.js';
import type { TipoEventoSeguridad } from './ports/repositorios.js';

/** Acota el `count` de la lista sobre tablas de 100 000 eventos (TR-RNF-002). */
export const DIAS_MAXIMOS_BITACORA = 92;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface ConsultaBitacora extends Pagina {
  desde?: string;
  hasta?: string;
  tipo?: TipoEventoSeguridad;
  usuario?: string;
}

export interface DependenciasLecturaBitacora {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaBitacora;
}

/** Bitácora del tenant del token con rango obligatorio de hasta 92 días (TR-RF-019). */
export class ConsultarBitacora {
  constructor(private readonly dependencias: DependenciasLecturaBitacora) {}

  async ejecutar(consulta: ConsultaBitacora): Promise<Listado<EventoBitacora>> {
    const filtro: FiltroBitacora = { ...consulta, ...rangoValido(consulta.desde, consulta.hasta) };
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(() => lectura.listar(filtro));
  }
}

export class ConsultarEventoSeguridad {
  constructor(private readonly dependencias: DependenciasLecturaBitacora) {}

  /** Un evento de otro tenant no se ve con la RLS: responde que no existe (404, no 403). */
  ejecutar(id: string): Promise<EventoBitacoraDetalle> {
    const { unidadDeTrabajo, lectura } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const detalle = await lectura.detalle(id);
      if (!detalle) throw new NotFoundError('El evento no existe');
      return detalle;
    });
  }
}

export function rangoValido(desde: string | undefined, hasta: string | undefined): { desde: Fecha; hasta: Fecha } {
  if (!desde || !hasta) throw new RangoBitacoraInvalidoError();
  const inicio = diaCalendario(desde);
  const fin = diaCalendario(hasta);
  if (inicio === null || fin === null || fin < inicio) throw new RangoBitacoraInvalidoError();
  if ((fin - inicio) / MILISEGUNDOS_POR_DIA >= DIAS_MAXIMOS_BITACORA) throw new RangoBitacoraInvalidoError();
  return { desde, hasta };
}

/** Milisegundos del día a medianoche UTC, o null si no es una fecha que exista (2026-02-30). */
function diaCalendario(valor: string): number | null {
  if (!FORMATO_FECHA.test(valor)) return null;
  const instante = new Date(`${valor}T00:00:00Z`);
  return instante.toISOString().startsWith(valor) ? instante.getTime() : null;
}
