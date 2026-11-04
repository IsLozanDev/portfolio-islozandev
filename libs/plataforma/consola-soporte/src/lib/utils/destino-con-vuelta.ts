import { PARAMETRO_VOLVER_A } from '@vitrina/shared/auth';

/** `?volverA=` con la página actual: la app de administración muestra el enlace de vuelta si el origen está en su lista (U-06). */
export function destinoConVuelta(urlAdministracion: string, actual: string): string {
  const destino = new URL(urlAdministracion);
  destino.searchParams.set(PARAMETRO_VOLVER_A, actual);
  return destino.href;
}
