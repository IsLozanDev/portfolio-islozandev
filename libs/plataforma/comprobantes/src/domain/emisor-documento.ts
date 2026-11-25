import { CODIGO_ESTABLECIMIENTO_DOMICILIO_FISCAL, type EmisorDocumento } from './documento-electronico.js';
import { DatosEmisorIncompletosError } from './errores.js';

/** Lo que FE lee de ORG sobre la empresa emisora; `EmpresaEmisora` del puerto lo cumple. */
export interface DatosEmisor {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  domicilioFiscal: string | null;
  ubigeo: string | null;
}

const SIN_DATO = '';

function exigirDato(valor: string | null, campo: string): string {
  if (valor === null || valor.trim() === '') throw new DatosEmisorIncompletosError(campo);
  return valor;
}

/** El UBL exige domicilio fiscal, ubigeo y anexo del establecimiento: si falta uno, DATOS_EMISOR_INCOMPLETOS. */
export function exigirDatosEmisor(empresa: DatosEmisor, codigoEstablecimiento: string | null): EmisorDocumento {
  return {
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial,
    domicilioFiscal: exigirDato(empresa.domicilioFiscal, 'domicilioFiscal'),
    ubigeo: exigirDato(empresa.ubigeo, 'ubigeo'),
    codigoEstablecimiento: exigirDato(codigoEstablecimiento, 'codigoEstablecimiento'),
  };
}

/**
 * La prueba en beta por PSE (spec 50) no usa la dirección del emisor: se arma con lo que haya en ORG, desde el
 * domicilio fiscal, para no exigir datos que esa prueba nunca exigió.
 */
export function emisorDePrueba(empresa: DatosEmisor): EmisorDocumento {
  return {
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial,
    domicilioFiscal: empresa.domicilioFiscal ?? SIN_DATO,
    ubigeo: empresa.ubigeo ?? SIN_DATO,
    codigoEstablecimiento: CODIGO_ESTABLECIMIENTO_DOMICILIO_FISCAL,
  };
}
