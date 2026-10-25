import { Serie } from '../../domain/serie.js';
import type { FilaSerie } from './entidades.js';

// Las entidades ORM no son los agregados: el paso de una a otro va aquí, campo por campo.

export function serieDesdeFila(fila: FilaSerie): Serie {
  return Serie.reconstituir(fila.id, Number(fila.version), {
    tenantId: fila.tenantId,
    ambito: { empresaId: fila.empresaId, sucursalId: fila.sucursalId, unidadId: fila.unidadId },
    tipo: fila.tipo,
    codigo: fila.serie,
    digitos: fila.digitos,
    reinicio: fila.reinicio,
    ultimoNumero: Number(fila.ultimoNumero),
    activa: fila.activa,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

/** Sin periodo: lo fija el trigger de la base al insertar. */
export function filaDesdeSerie(serie: Serie): FilaSerie {
  return {
    id: serie.id,
    tenantId: serie.tenantId,
    empresaId: serie.ambito.empresaId,
    sucursalId: serie.ambito.sucursalId,
    unidadId: serie.ambito.unidadId,
    tipo: serie.tipo,
    serie: serie.codigo,
    digitos: serie.digitos,
    reinicio: serie.reinicio,
    ultimoNumero: String(serie.ultimoNumero),
    activa: serie.activa,
    version: String(serie.version),
    creadoPor: serie.creadoPor,
    creadoEn: serie.creadoEn,
    modificadoPor: serie.modificadoPor,
    modificadoEn: serie.modificadoEn,
  };
}
