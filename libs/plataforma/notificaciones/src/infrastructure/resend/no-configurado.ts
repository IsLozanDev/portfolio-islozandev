import type { ProveedorCorreo } from '../../application/ports/proveedor-correo.js';
import type { VerificadorWebhook } from '../../application/ports/verificador-webhook.js';
import { ProveedorNoConfiguradoError } from '../../domain/errores.js';

/** Sin `RESEND_API_KEY` (dev, pruebas): la app arranca y cada envío falla; el mensaje sigue ENCOLADO. */
export const PROVEEDOR_NO_CONFIGURADO: ProveedorCorreo = {
  enviar: () => Promise.reject(new ProveedorNoConfiguradoError()),
};

/** Sin `RESEND_WEBHOOK_SECRET`: ningún aviso se acepta. */
export const VERIFICADOR_NO_CONFIGURADO: VerificadorWebhook = {
  verificar: () => {
    throw new ProveedorNoConfiguradoError();
  },
};
