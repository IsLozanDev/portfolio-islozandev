import type { DatosDni, DatosRuc, DocumentoConDatos } from './datos-identidad.js';

function recortarDni({ nombres, apellidos }: DatosDni): DatosDni {
  return { nombres, apellidos };
}

function recortarRuc({ razonSocial, estado, condicion, direccionFiscal, ubigeo }: DatosRuc): DatosRuc {
  return { razonSocial, estado, condicion, direccionFiscal, ubigeo };
}

/** TR-RN-032: solo los campos mínimos llegan a la caché, aunque el proveedor devuelva más. */
export function recortarCamposMinimos(documento: DocumentoConDatos): DocumentoConDatos {
  if (documento.tipo === 'DNI') return { tipo: 'DNI', datos: recortarDni(documento.datos) };
  return { tipo: 'RUC', datos: recortarRuc(documento.datos) };
}
