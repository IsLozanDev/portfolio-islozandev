export interface CorreoSaliente {
  /** También es la `Idempotency-Key` del proveedor: un reintento no duplica el correo. */
  mensajeId: string;
  remitente: string;
  destino: string;
  asunto: string;
  html: string;
}

/** Timeout, red, 5xx, 429 o circuito abierto: se reintenta. `codigo` nunca lleva el destino. */
export class ErrorTemporalProveedor extends Error {
  constructor(readonly codigo: string) {
    super(`Error temporal del proveedor de correo: ${codigo}`);
    this.name = 'ErrorTemporalProveedor';
  }
}

/** 4xx de validación: no se reintenta. */
export class ErrorDefinitivoProveedor extends Error {
  constructor(readonly codigo: string) {
    super(`Error definitivo del proveedor de correo: ${codigo}`);
    this.name = 'ErrorDefinitivoProveedor';
  }
}

export interface ProveedorCorreo {
  /** Lanza ErrorTemporalProveedor (timeout, 5xx, 429, circuito abierto) o ErrorDefinitivoProveedor (4xx de validación). */
  enviar(correo: CorreoSaliente): Promise<{ idExterno: string }>;
}
