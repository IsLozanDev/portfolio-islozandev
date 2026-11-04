/**
 * Clave del `data` de la ruta que monta `CONSOLA_SOPORTE_ROUTES` con la URL de `plataforma-admin` del
 * ambiente. Va en la ruta y no en un proveedor: la lib se carga diferida y la app no puede importarla
 * estática (regla de Nx), así que la app escribe la clave tal cual.
 */
export const DATO_URL_ADMINISTRACION = 'urlAdministracion';
