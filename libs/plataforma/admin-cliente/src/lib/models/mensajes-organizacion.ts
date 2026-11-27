import type { TextosUbigeo } from '@vitrina/plataforma/personas-ui';
import type { MotivoLogoInvalido } from './empresa';

/** Textos de empresas, sucursales y unidades (spec 17c), en español de Perú. */
export const MENSAJES_ORGANIZACION = {
  /** TR-RNF-008: reemplaza el texto de `VERSION_OBSOLETA` de la API. */
  versionObsoleta: 'Otro usuario modificó el registro; recargue',
  recargar: 'Recargar',
  editar: 'Editar',
  guardarCambios: 'Guardar cambios',
  sinDato: '—',
  // Spec 17d: campos que comparten empresa y sucursal.
  etiquetaUbigeo: 'Ubigeo (departamento / provincia / distrito)',
  ayudaTelefono: 'Solo dígitos: se da formato solo. Celular 987 654 321 · fijo (01) 555-0101',
} as const;

export const MENSAJES_EMPRESAS = {
  titulo: 'Empresas',
  nueva: 'Nueva empresa',
  tituloNueva: 'Nueva empresa',
  tituloEdicion: 'Editar empresa',
  sinEmpresas: 'No hay empresas registradas.',
  verSucursales: 'Sucursales',
  logo: 'Logo',
  ruc: 'RUC',
  razonSocial: 'Razón social',
  nombreComercial: 'Nombre comercial',
  direccionFiscal: 'Dirección fiscal',
  ubigeo: 'Ubigeo',
  ayudaRazonSocial: 'Escríbala como figura en SUNAT.',
  /** Spec 28b: el padrón no respondió o no tiene el RUC. */
  noEnPadron: 'No se encontró en el padrón; ingrésela manualmente',
  consultandoPadron: 'Consultando…',
  registradaConObservaciones: 'Empresa registrada con observaciones',
  registrar: 'Registrar empresa',
  /** TR-CA-004: la API crea también la sucursal principal. */
  registrada: 'Empresa registrada con su sucursal principal 0000',
  actualizada: 'Empresa actualizada',
  noExiste: 'La empresa no existe',
  volver: 'Volver a empresas',
  // Spec 17d: dos tarjetas, identidad y contacto.
  datosTributarios: 'Datos tributarios',
  identidadContacto: 'Identidad y contacto',
  ayudaIdentidad: 'Se imprimen en sus comprobantes y aparecen en los correos de su empresa.',
  logoPendiente: 'Logo nuevo sin guardar',
  logoPorQuitar: 'El logo se quitará al guardar',
  quitarLogo: 'Quitar logo',
  sinLogo: 'Sin logo',
  zonaLogo: 'Arrastra el logo aquí',
  logoAlRegistrar: 'Se habilita al registrar la empresa',
  sinPermisoSubir: 'No tiene permiso para subir archivos',
  pidaAlPropietario: 'Pida a un propietario que suba el logo.',
  logoAlGuardar: 'El logo se asigna al guardar.',
  recienRegistrada: 'Empresa registrada.',
  ahoraPuedeSubirLogo: 'Ahora puede subir el logo.',
  telefono: 'Teléfono (opcional)',
  correo: 'Correo (opcional)',
  ayudaCorreo: 'Se guarda en minúsculas.',
  sitioWeb: 'Página web (opcional)',
  ayudaSitioWeb: 'Puede escribir www.suempresa.pe: al salir del campo se completa con https://',
} as const;

/** Bajo la zona del logo, por cada motivo de `LOGO_INVALIDO` (spec 17d). */
export const MENSAJES_LOGO_INVALIDO: Readonly<Record<MotivoLogoInvalido, string>> = {
  NO_ENCONTRADO: 'No se encontró ese archivo. Súbalo de nuevo desde aquí.',
  NO_DISPONIBLE: 'El archivo todavía no está disponible. Espere el análisis o súbalo de nuevo.',
  CATEGORIA: 'Ese archivo no es un logo. Súbalo de nuevo desde aquí.',
  OTRA_ENTIDAD: 'Ese archivo no es un logo de esta empresa. Súbalo de nuevo desde aquí.',
};

/** Empresa y sucursal tratan de usted; la ficha de persona conserva los suyos (spec 17d). */
export const TEXTOS_UBIGEO_ORGANIZACION: TextosUbigeo = {
  ayuda: 'Escriba el distrito, la provincia o el departamento y elija de la lista.',
  ayudaElegido: (ubigeo) => `Se guarda el código ${ubigeo.codigo}.`,
  error: 'Elija un distrito de la lista',
  errorCarga: 'No se pudo cargar el catálogo de ubigeos: se conserva el código guardado.',
  sinPermiso: 'No tiene permiso para ver el catálogo de ubigeos',
};

export const ETIQUETAS_ESTADO_FILTRO = { activas: 'Activas', inactivas: 'Inactivas', todas: 'Todas' } as const;

export const MENSAJES_SUCURSALES = {
  titulo: 'Sucursales',
  nueva: 'Nueva sucursal',
  empresa: 'Empresa',
  estado: 'Estado',
  sinEmpresas: 'Primero registre una empresa',
  irANuevaEmpresa: 'Nueva empresa',
  sinSucursales: 'No hay sucursales con estos filtros.',
  codigo: 'Código',
  nombre: 'Nombre',
  establecimiento: 'Establecimiento',
  ubigeo: 'Ubigeo',
  principal: 'Principal',
  sinEstablecimiento: 'Sin establecimiento',
  activa: 'Activa',
  inactiva: 'Inactiva',
  verUnidades: 'Unidades',
  marcarPrincipal: 'Marcar como principal',
  inactivar: 'Inactivar',
  reactivar: 'Reactivar',
  tituloMarcarPrincipal: 'Cambiar la sucursal principal',
  /** TR-CA-009 y brecha 5: la anterior pierde el 0000 y queda sin establecimiento. */
  textoMarcarPrincipal: (nueva: string, actual: string) =>
    `${nueva} pasará a ser la principal y ${actual} dejará de serlo. ${actual} quedará sin establecimiento SUNAT; asígnele uno al editarla.`,
  principalActual: 'la principal actual',
  tituloInactivar: 'Inactivar sucursal',
  textoInactivar: (nombre: string) => `¿Inactivar la sucursal ${nombre}? Dejará de aparecer en el selector de sucursales.`,
  tituloPrincipalNoInactivable: 'No se puede inactivar la principal',
  /** TR-RN-003, el mismo texto que el dominio. */
  principalNoInactivable: 'Marque otra sucursal como principal antes de inactivar esta',
  principalCambiada: 'Sucursal principal cambiada',
  inactivada: 'Sucursal inactivada',
  reactivada: 'Sucursal reactivada',
  tituloNueva: 'Nueva sucursal',
  tituloEdicion: 'Editar sucursal',
  establecimientoSunat: 'Establecimiento SUNAT',
  direccion: 'Dirección',
  telefono: 'Teléfono (opcional)',
  /** Spec 17d: un teléfono guardado antes del formato E.164. */
  telefonoAnterior: (telefono: string) => `El teléfono guardado («${telefono}») no tiene el formato nuevo. Corríjalo para poder guardar.`,
  corregirTelefono: 'Corrija el teléfono para guardar.',
  zonaHoraria: 'Zona horaria',
  ayudaZonaHoraria: 'Nombre IANA, p. ej. America/Lima',
  ayudaPrincipal: 'La sucursal principal conserva el establecimiento 0000.',
  /** Brecha 5: la que dejó de ser principal quedó sin establecimiento. */
  ayudaAsignarEstablecimiento: 'Asigne el establecimiento SUNAT de esta sucursal',
  registrar: 'Registrar sucursal',
  registrada: 'Sucursal registrada',
  actualizada: 'Sucursal actualizada',
  noExiste: 'La sucursal no existe',
  volver: 'Volver a sucursales',
} as const;

export const MENSAJES_UNIDADES = {
  titulo: 'Unidades',
  nueva: 'Nueva unidad',
  tituloNueva: 'Nueva unidad',
  tituloEdicion: 'Editar unidad',
  empresa: 'Empresa',
  sucursal: 'Sucursal',
  tipo: 'Tipo',
  estado: 'Estado',
  todas: 'Todas',
  todos: 'Todos',
  sinEmpresas: 'Primero registre una empresa',
  irANuevaEmpresa: 'Nueva empresa',
  sinUnidades: 'No hay unidades con estos filtros.',
  codigo: 'Código',
  nombre: 'Nombre',
  /** TR-CA-012: el almacén de nivel empresa sirve a todas sus sucursales. */
  nivelEmpresa: 'Empresa',
  sinSucursal: 'Sin sucursal (nivel empresa)',
  padre: 'Unidad padre',
  sinPadre: 'Sin padre',
  impresora: 'Impresora',
  capacidad: 'Capacidad',
  piso: 'Piso',
  atributos: 'Atributos',
  activa: 'Activa',
  inactiva: 'Inactiva',
  inactivar: 'Inactivar',
  reactivar: 'Reactivar',
  tituloInactivar: 'Inactivar unidad',
  textoInactivar: (nombre: string) => `¿Inactivar la unidad ${nombre}?`,
  inactivada: 'Unidad inactivada',
  reactivada: 'Unidad reactivada',
  registrar: 'Registrar unidad',
  registrada: 'Unidad registrada',
  actualizada: 'Unidad actualizada',
  noExiste: 'La unidad no existe',
  volver: 'Volver a unidades',
} as const;

export const MENSAJES_VALIDACION_ORGANIZACION = {
  rucInvalido: 'RUC inválido',
  establecimientoFormato: 'El establecimiento SUNAT tiene 4 dígitos',
  establecimientoPrincipal: 'El establecimiento 0000 corresponde a la sucursal principal',
  /** TR-CA-011, el mismo texto que el dominio. */
  sucursalRequerida: 'Solo los almacenes pueden registrarse sin sucursal',
  capacidadEntera: 'La capacidad es un número entero mayor o igual a 0',
  telefonoPeru: 'Celular de 9 dígitos que empieza con 9, o fijo con código de área',
  sitioWeb: 'Ingrese una dirección que empiece con https://',
} as const;
