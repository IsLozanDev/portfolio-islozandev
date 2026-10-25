import { DefinicionParametro } from '../../domain/definicion-parametro.js';
import { ValorParametro } from '../../domain/valor-parametro.js';
import type { FilaDefinicion, FilaValor, ValorJson } from './entidades.js';

// Las entidades ORM no son los agregados: el paso de una a otro va aquí, campo por campo.

export function definicionDesdeFila(fila: FilaDefinicion): DefinicionParametro {
  return DefinicionParametro.reconstituir({
    codigo: fila.codigo,
    productoCodigo: fila.productoCodigo,
    descripcion: fila.descripcion,
    tipo: fila.tipo,
    valorDefecto: fila.valorDefecto,
    alcanceMaximo: fila.alcanceMaximo,
    esquema: fila.esquema,
    obsoleto: fila.obsoleto,
  });
}

export function valorDesdeFila(fila: FilaValor): ValorParametro {
  return ValorParametro.reconstituir(fila.id, Number(fila.version), {
    tenantId: fila.tenantId,
    codigo: fila.codigo,
    ambito: { alcance: fila.alcance, empresaId: fila.empresaId, sucursalId: fila.sucursalId },
    valor: fila.valor,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

/** La definición ya validó el valor contra su tipo: nunca es null ni undefined. */
export function filaDesdeValor(valorParametro: ValorParametro): FilaValor {
  return {
    id: valorParametro.id,
    tenantId: valorParametro.tenantId,
    codigo: valorParametro.codigo,
    alcance: valorParametro.ambito.alcance,
    empresaId: valorParametro.ambito.empresaId,
    sucursalId: valorParametro.ambito.sucursalId,
    valor: valorParametro.valor as ValorJson,
    version: String(valorParametro.version),
    modificadoPor: valorParametro.modificadoPor,
    modificadoEn: valorParametro.modificadoEn,
  };
}
