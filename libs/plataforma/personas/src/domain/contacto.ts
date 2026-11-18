import { validarCelular, validarCorreo } from '@vitrina/shared/util';
import { ContactoInvalidoError } from './errores.js';

export const TIPOS_CONTACTO = ['CELULAR', 'FIJO', 'CORREO', 'WHATSAPP'] as const;
export type TipoContacto = (typeof TIPOS_CONTACTO)[number];

const LONGITUD_MAXIMA_VALOR = 254;

interface ReglaDeFormato {
  esValido: (valor: string) => boolean;
  mensaje: string;
}

/** Fijo y WhatsApp no tienen regla de formato todavía: los agrega el spec 32. */
const REGLAS_DE_FORMATO: Partial<Record<TipoContacto, ReglaDeFormato>> = {
  CELULAR: { esValido: validarCelular, mensaje: 'El celular debe tener 9 dígitos e iniciar con 9' },
  CORREO: { esValido: validarCorreo, mensaje: 'El correo no tiene un formato válido' },
};

export interface DatosContacto {
  id: string;
  tipo: TipoContacto;
  valor: string;
  principal: boolean;
}

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
    if (regla && !regla.esValido(valor)) throw new ContactoInvalidoError(regla.mensaje);
    return new Contacto(datos.id, datos.tipo, valor, datos.principal);
  }

  static reconstituir(datos: DatosContacto): Contacto {
    return new Contacto(datos.id, datos.tipo, datos.valor, datos.principal);
  }
}
