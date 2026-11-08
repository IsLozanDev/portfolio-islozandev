import type { ClaveConocida } from './atributos';

/** Textos del formulario de ítem, en español de Perú. Los comparten la consola y admin. */
export const MENSAJES_FORMULARIO_ITEM = {
  datos: 'Datos del ítem',
  codigo: 'Código',
  ayudaCodigo: 'No cambia después de crear',
  codigoExterno: 'Código externo (opcional)',
  nombre: 'Nombre',
  abreviatura: 'Abreviatura (opcional)',
  orden: 'Orden (opcional)',
  activo: 'Activo',
  vigencia: 'Vigencia',
  vigenteDesde: 'Vigente desde',
  vigenteHasta: 'Vigente hasta (opcional)',
  ayudaFecha: 'dd/mm/aaaa',
  atributos: 'Atributos',
  longitud: 'Longitud',
  regex: 'Expresión regular',
  validaReniec: 'Valida con RENIEC',
  mascara: 'Máscara',
  jsonAvanzado: 'JSON avanzado',
  ayudaJsonAvanzado: 'Otras claves como objeto JSON, p. ej. {"decimales": 2}',
  guardar: 'Guardar',
  vigenciaInvertida: 'La vigencia final no puede ser anterior a la inicial',
  fechaInvalida: 'Ingrese una fecha válida (dd/mm/aaaa)',
  regexInvalida: 'La expresión regular no es válida',
  enteroInvalido: 'Ingrese un número entero',
  jsonInvalido: 'Debe ser un objeto JSON, p. ej. {"clave": "valor"}',
  atributosGrandes: 'Los atributos superan 4 KB',
} as const;

export function mensajeClaveConocidaEnJson(clave: ClaveConocida): string {
  return `Use el campo de arriba para ${clave}`;
}

/** Nombre accesible del formulario. */
export function mensajeFormularioDe(codigoCatalogo: string): string {
  return `Ítem del catálogo ${codigoCatalogo}`;
}

export function mensajeVigenciaFutura(fecha: string): string {
  return `No aparecerá en las consultas hasta el ${fecha}`;
}
