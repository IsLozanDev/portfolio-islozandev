import { ValidationError } from '@vitrina/plataforma/kernel';

const FORMATO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CodigoTenant {
  private constructor(readonly valor: string) {}

  static de(valor: string): CodigoTenant {
    if (valor.length < 3 || valor.length > 30 || !FORMATO.test(valor)) {
      throw new ValidationError('El código de tenant debe tener de 3 a 30 caracteres: minúsculas, dígitos y guiones');
    }
    return new CodigoTenant(valor);
  }
}
