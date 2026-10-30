/** Textos de empresas, sucursales y unidades (spec 17c), en español de Perú. */
export const MENSAJES_ORGANIZACION = {
  /** TR-RNF-008: reemplaza el texto de `VERSION_OBSOLETA` de la API. */
  versionObsoleta: 'Otro usuario modificó el registro; recargue',
  recargar: 'Recargar',
  editar: 'Editar',
  guardarCambios: 'Guardar cambios',
  sinDato: '—',
} as const;

export const MENSAJES_EMPRESAS = {
  titulo: 'Empresas',
  nueva: 'Nueva empresa',
  tituloNueva: 'Nueva empresa',
  tituloEdicion: 'Editar empresa',
  sinEmpresas: 'No hay empresas registradas.',
  verSucursales: 'Sucursales',
  ruc: 'RUC',
  razonSocial: 'Razón social',
  nombreComercial: 'Nombre comercial',
  direccionFiscal: 'Dirección fiscal',
  ubigeo: 'Ubigeo',
  ayudaRazonSocial: 'Escríbala como figura en SUNAT.',
  registrar: 'Registrar empresa',
  /** TR-CA-004: la API crea también la sucursal principal. */
  registrada: 'Empresa registrada con su sucursal principal 0000',
  actualizada: 'Empresa actualizada',
  noExiste: 'La empresa no existe',
  volver: 'Volver a empresas',
} as const;

export const MENSAJES_VALIDACION_ORGANIZACION = {
  rucInvalido: 'RUC inválido',
  ubigeoFormato: 'El ubigeo tiene 6 dígitos',
  establecimientoFormato: 'El establecimiento SUNAT tiene 4 dígitos',
  establecimientoPrincipal: 'El establecimiento 0000 corresponde a la sucursal principal',
  /** TR-CA-011, el mismo texto que el dominio. */
  sucursalRequerida: 'Solo los almacenes pueden registrarse sin sucursal',
  capacidadEntera: 'La capacidad es un número entero mayor o igual a 0',
} as const;
