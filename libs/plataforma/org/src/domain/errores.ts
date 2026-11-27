import { ValidationError } from '@vitrina/plataforma/kernel';
import type { MotivoLogoInvalido } from './logo.js';

export class TelefonoInvalidoError extends ValidationError {
  override readonly code = 'TELEFONO_INVALIDO';

  constructor() {
    super('Celular de 9 dígitos que empieza con 9, o fijo con código de área');
  }
}

export class CorreoInvalidoError extends ValidationError {
  override readonly code = 'CORREO_INVALIDO';

  constructor() {
    super('El correo no tiene un formato válido');
  }
}

export class SitioWebInvalidoError extends ValidationError {
  override readonly code = 'SITIO_WEB_INVALIDO';

  constructor() {
    super('El sitio web debe empezar con https://');
  }
}

export class LogoInvalidoError extends ValidationError {
  override readonly code = 'LOGO_INVALIDO';

  constructor(readonly motivo: MotivoLogoInvalido) {
    super('El archivo no sirve como logo de esta empresa');
  }
}
