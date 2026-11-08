import { Feriado } from '../../domain/feriados/feriado.js';
import type { FilaFeriado } from './entidades.js';

export function feriadoDesdeFila(fila: FilaFeriado): Feriado {
  return Feriado.reconstituir(fila.id, Number(fila.version), {
    alcance: fila.alcance,
    tenantId: fila.tenantId,
    sucursalId: fila.sucursalId,
    fecha: fila.fecha,
    nombre: fila.nombre,
    recurrenteAnual: fila.recurrenteAnual,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

/** `version` aparte: el agregado lleva la que leyó y la fila guarda la siguiente. */
export function filaDesdeFeriado(feriado: Feriado, version: number): FilaFeriado {
  return {
    id: feriado.id,
    alcance: feriado.alcance,
    tenantId: feriado.tenantId,
    sucursalId: feriado.sucursalId,
    fecha: feriado.fecha,
    nombre: feriado.nombre,
    recurrenteAnual: feriado.recurrenteAnual,
    version: String(version),
    creadoPor: feriado.creadoPor,
    creadoEn: feriado.creadoEn,
    modificadoPor: feriado.modificadoPor,
    modificadoEn: feriado.modificadoEn,
  };
}
