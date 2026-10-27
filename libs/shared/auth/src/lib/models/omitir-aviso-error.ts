import { HttpContextToken } from '@angular/common/http';

/**
 * Marca una petición cuyo error muestra quien la hizo: el interceptor de errores del shell
 * no abre su modal. Vive aquí porque `SesionService` lo pone y una lib data-access no importa del shell.
 */
export const OMITIR_AVISO_ERROR = new HttpContextToken<boolean>(() => false);

export interface OpcionesCargaContexto {
  omitirAvisoError?: boolean;
}
