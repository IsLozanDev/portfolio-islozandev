import type { DatosDni, DatosRuc } from '../../domain/datos-identidad.js';
import type { EntradaCache } from '../../domain/entrada-cache.js';
import type { DatosCacheDni, DatosCacheRuc, FilaCacheDocumento } from './entidades.js';

function datosDniDesdeFila({ nombres, apellidos }: DatosCacheDni): DatosDni {
  return { nombres, apellidos };
}

function datosRucDesdeFila(datos: DatosCacheRuc): DatosRuc {
  return {
    razonSocial: datos.razon_social,
    estado: datos.estado,
    condicion: datos.condicion,
    direccionFiscal: datos.direccion_fiscal,
    ubigeo: datos.ubigeo,
  };
}

function filaDesdeDatosRuc(datos: DatosRuc): DatosCacheRuc {
  return {
    razon_social: datos.razonSocial,
    estado: datos.estado,
    condicion: datos.condicion,
    direccion_fiscal: datos.direccionFiscal,
    ubigeo: datos.ubigeo,
  };
}

function filaDesdeDatosDni({ nombres, apellidos }: DatosDni): DatosCacheDni {
  return { nombres, apellidos };
}

export function entradaDesdeFila(fila: FilaCacheDocumento): EntradaCache {
  const comunes = { numero: fila.numero, fuente: fila.fuente, consultadoEn: fila.consultadoEn, expiraEn: fila.expiraEn };
  if (fila.tipoDoc === 'DNI') return { tipo: 'DNI', datos: datosDniDesdeFila(fila.datos as DatosCacheDni), ...comunes };
  return { tipo: 'RUC', datos: datosRucDesdeFila(fila.datos as DatosCacheRuc), ...comunes };
}

export function filaDesdeEntrada(entrada: EntradaCache): FilaCacheDocumento {
  return {
    tipoDoc: entrada.tipo,
    numero: entrada.numero,
    datos: entrada.tipo === 'DNI' ? filaDesdeDatosDni(entrada.datos) : filaDesdeDatosRuc(entrada.datos),
    fuente: entrada.fuente,
    consultadoEn: entrada.consultadoEn,
    expiraEn: entrada.expiraEn,
  };
}
