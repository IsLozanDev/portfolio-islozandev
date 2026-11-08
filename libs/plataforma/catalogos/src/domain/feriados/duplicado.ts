import type { Feriado } from './feriado.js';

/**
 * Regla de duplicado de TR-CA-077, la misma que `cat.feriado_choca`. `existente` choca con `nuevo` si está en
 * el mismo nivel o en uno que lo cubre y comparten fecha efectiva. Un global no revisa los de los tenants y
 * un feriado del tenant no revisa los de sus sucursales.
 */
export function chocan(nuevo: Feriado, existente: Feriado): boolean {
  if (nuevo.id === existente.id) return false;
  return cubre(existente, nuevo) && mismaFechaEfectiva(nuevo, existente);
}

function cubre(existente: Feriado, nuevo: Feriado): boolean {
  if (existente.esGlobal) return true;
  if (nuevo.esGlobal || existente.tenantId !== nuevo.tenantId) return false;
  if (existente.alcance === 'TENANT') return true;
  return nuevo.alcance === 'SUCURSAL' && existente.sucursalId === nuevo.sucursalId;
}

/** Con un recurrente de por medio: mismo día y mes, y el no recurrente en el año del recurrente o después. */
function mismaFechaEfectiva(nuevo: Feriado, existente: Feriado): boolean {
  if (!nuevo.recurrenteAnual && !existente.recurrenteAnual) return nuevo.fecha === existente.fecha;
  if (nuevo.mesDia !== existente.mesDia) return false;
  if (nuevo.recurrenteAnual && existente.recurrenteAnual) return true;
  const recurrente = nuevo.recurrenteAnual ? nuevo : existente;
  const unico = nuevo.recurrenteAnual ? existente : nuevo;
  return unico.anio >= recurrente.anio;
}
