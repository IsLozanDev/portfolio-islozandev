import { ValidationError } from '@vitrina/plataforma/kernel';
import { validarRuc } from '@vitrina/shared/util';

/** TR-RN-002: 11 dígitos, prefijo 10/15/17/20 y dígito verificador módulo 11. */
export class Ruc {
  private constructor(readonly valor: string) {}

  static de(valor: string): Ruc {
    if (!validarRuc(valor)) throw new ValidationError('RUC inválido');
    return new Ruc(valor);
  }
}

/** Solo formato: el catálogo UBIGEO llega con el spec 19a. */
export class Ubigeo {
  private constructor(readonly valor: string) {}

  static de(valor: string): Ubigeo {
    if (!/^\d{6}$/.test(valor)) throw new ValidationError('El ubigeo debe tener 6 dígitos');
    return new Ubigeo(valor);
  }

  static opcional(valor: string | null | undefined): string | null {
    return valor ? Ubigeo.de(valor).valor : null;
  }
}

/** Establecimiento anexo SUNAT; 0000 es el domicilio fiscal (TR-RN-003). */
export class CodigoEstablecimiento {
  static readonly DOMICILIO_FISCAL = '0000';

  private constructor(readonly valor: string) {}

  static de(valor: string): CodigoEstablecimiento {
    if (!/^\d{4}$/.test(valor)) throw new ValidationError('El código de establecimiento SUNAT debe tener 4 dígitos');
    return new CodigoEstablecimiento(valor);
  }

  static opcional(valor: string | null | undefined): string | null {
    return valor ? CodigoEstablecimiento.de(valor).valor : null;
  }
}
