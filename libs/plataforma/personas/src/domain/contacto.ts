import { validarCelular, validarCorreo, validarTelefonoFijo, validarWhatsapp } from '@vitrina/shared/util';
import { ContactoInvalidoError } from './errores.js';

export const TIPOS_CONTACTO = ['CELULAR', 'FIJO', 'CORREO', 'WHATSAPP'] as const;
export type TipoContacto = (typeof TIPOS_CONTACTO)[number];

const LONGITUD_MAXIMA_VALOR = 254;

interface ReglaDeFormato {
  esValido: (valor: string) => boolean;
  mensaje: string;
}

const REGLAS_DE_FORMATO: Record<TipoContacto, ReglaDeFormato> = {
  CELULAR: { esValido: validarCelular, mensaje: 'El celular debe tener 9 dígitos e iniciar con 9' },
  FIJO: { esValido: validarTelefonoFijo, mensaje: 'El teléfono fijo debe tener de 6 a 9 dígitos' },
  CORREO: { esValido: validarCorreo, mensaje: 'El correo no tiene un formato válido' },
  WHATSAPP: { esValido: validarWhatsapp, mensaje: 'El WhatsApp debe ir en formato internacional: + y de 8 a 15 dígitos' },
};

export interface DatosContacto {
  id: string;
  tipo: TipoContacto;
  valor: string;
  principal: boolean;
}

/** Inmutable: un cambio de valor o de principal devuelve otro contacto. El tipo no cambia. */
export class Contacto {
  private constructor(
    readonly id: string,
    readonly tipo: TipoContacto,
    readonly valor: string,
    readonly principal: boolean,
  ) {}

  static crear(datos: DatosContacto): Contacto {
    const valor = datos.valor.trim();
    if (valor === '' || valor.length > LONGITUD_MAXIMA_VALOR) {
      throw new ContactoInvalidoError(`El contacto debe tener entre 1 y ${LONGITUD_MAXIMA_VALOR} caracteres`);
    }
    const regla = REGLAS_DE_FORMATO[datos.tipo];
    if (!regla.esValido(valor)) throw new ContactoInvalidoError(regla.mensaje);
    return new Contacto(datos.id, datos.tipo, valor, datos.principal);
  }

  static reconstituir(datos: DatosContacto): Contacto {
    return new Contacto(datos.id, datos.tipo, datos.valor, datos.principal);
  }

  conValor(valor: string): Contacto {
    return Contacto.crear({ id: this.id, tipo: this.tipo, valor, principal: this.principal });
  }

  conPrincipal(principal: boolean): Contacto {
    return new Contacto(this.id, this.tipo, this.valor, principal);
  }

  esMismoContacto(otro: Contacto): boolean {
    return this.tipo === otro.tipo && this.valor === otro.valor;
  }
}
