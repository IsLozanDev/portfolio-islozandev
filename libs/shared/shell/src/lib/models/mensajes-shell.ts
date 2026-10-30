/** Textos del shell en español de Perú. */
export const MENSAJES_SHELL = {
  /** TR-CA-046. */
  sinAccesos: 'No tiene accesos vigentes; contacte a su administrador',
  prohibido: 'No tiene permiso para ver esta página.',
  noEncontrado: 'La página que busca no existe.',
  elijaSucursal: 'Elija su sucursal',
  cargandoSucursales: 'Cargando sus sucursales…',
  errorCargarSucursales: 'No se pudieron cargar sus sucursales. Inténtelo de nuevo.',
  volverAlInicio: 'Volver al inicio',
  salir: 'Salir',
  nombreAppPorDefecto: 'Plataforma',
  abrirMenu: 'Abrir menú',
  menuPrincipal: 'Menú principal',
  menuUsuario: 'Menú de usuario',
  sinOpcionesMenu: 'No tiene opciones de menú',
  sucursalActual: 'Sucursal actual',
  errorCambiarSucursal: 'No se pudo cambiar de sucursal. Inténtelo de nuevo.',
  tituloSinConexion: 'Sin conexión',
  sinConexion: 'No se pudo conectar. Revise su conexión.',
  tituloErrorServidor: 'Error del servidor',
  errorServidor: 'Ocurrió un error en el servidor. Inténtelo de nuevo.',
  tituloMfaRequerida: 'Verificación requerida',
  mfaRequerida: 'Esta acción es sensible. Verifique su identidad con el segundo factor y vuelva a intentarlo.',
} as const;

/** Enlace de la barra tras una entrada profunda desde otra app (U-06). */
export function mensajeVolverA(nombreApp: string): string {
  return `Volver a ${nombreApp}`;
}

/** Toast tras cambiar de sucursal desde el encabezado (TR-CA-045). */
export function mensajeAhoraTrabajaEn(sucursal: string): string {
  return `Ahora trabaja en ${sucursal}`;
}
