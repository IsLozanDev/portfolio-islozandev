import { DireccionInvalidaError } from './errores.js';

/** Catálogo de TR-CAT con los distritos de INEI. */
export const CATALOGO_UBIGEO = 'UBIGEO';

const DIRECCION_MINIMA = 5;
const DIRECCION_MAXIMA = 250;
const REFERENCIA_MAXIMA = 150;
const FORMA_UBIGEO = /^\d{6}$/;

/** Nombres del catálogo `UBIGEO` copiados al guardar: la lectura no depende del catálogo. */
export interface UbicacionUbigeo {
  distrito: string;
  provincia: string;
  departamento: string;
}

export interface DatosDireccion {
  id: string;
  direccion: string;
  referencia?: string | null;
  ubigeo: string;
  ubicacion: UbicacionUbigeo;
  principal: boolean;
}

/** El ubigeo cambia junto con su ubicación. */
export type CambiosDireccion = Partial<Omit<DatosDireccion, 'id'>>;

/** Inmutable: un cambio devuelve otra dirección validada. */
export class Direccion {
  private constructor(
    readonly id: string,
    readonly direccion: string,
    readonly referencia: string | null,
    readonly ubigeo: string,
    readonly ubicacion: UbicacionUbigeo,
    readonly principal: boolean,
  ) {}

  static crear(datos: DatosDireccion): Direccion {
    const direccion = datos.direccion.trim();
    if (direccion.length < DIRECCION_MINIMA || direccion.length > DIRECCION_MAXIMA) {
      throw new DireccionInvalidaError(`La dirección debe tener entre ${DIRECCION_MINIMA} y ${DIRECCION_MAXIMA} caracteres`);
    }
    const referencia = datos.referencia?.trim() || null;
    if (referencia !== null && referencia.length > REFERENCIA_MAXIMA) {
      throw new DireccionInvalidaError(`La referencia admite hasta ${REFERENCIA_MAXIMA} caracteres`);
    }
    exigirFormatoDeUbigeo(datos.ubigeo);
    return new Direccion(datos.id, direccion, referencia, datos.ubigeo, { ...datos.ubicacion }, datos.principal);
  }

  static reconstituir(datos: DatosDireccion): Direccion {
    return new Direccion(datos.id, datos.direccion, datos.referencia ?? null, datos.ubigeo, datos.ubicacion, datos.principal);
  }

  /** Un campo ausente no cambia; `referencia: null` la borra. */
  con(cambios: CambiosDireccion): Direccion {
    return Direccion.crear({
      id: this.id,
      direccion: cambios.direccion ?? this.direccion,
      referencia: cambios.referencia === undefined ? this.referencia : cambios.referencia,
      ubigeo: cambios.ubigeo ?? this.ubigeo,
      ubicacion: cambios.ubicacion ?? this.ubicacion,
      principal: cambios.principal ?? this.principal,
    });
  }

  conPrincipal(principal: boolean): Direccion {
    return new Direccion(this.id, this.direccion, this.referencia, this.ubigeo, this.ubicacion, principal);
  }

  /** Mismo texto (sin distinguir mayúsculas ni espacios repetidos) y mismo ubigeo: al fusionar no se duplica. */
  esMismoLugar(otra: Direccion): boolean {
    return this.ubigeo === otra.ubigeo && normalizarTexto(this.direccion) === normalizarTexto(otra.direccion);
  }

  esIgualA(otra: Direccion): boolean {
    return (
      this.direccion === otra.direccion &&
      this.referencia === otra.referencia &&
      this.ubigeo === otra.ubigeo &&
      this.principal === otra.principal &&
      this.ubicacion.distrito === otra.ubicacion.distrito &&
      this.ubicacion.provincia === otra.ubicacion.provincia &&
      this.ubicacion.departamento === otra.ubicacion.departamento
    );
  }
}

function normalizarTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** El formato se revisa antes de consultar el catálogo: un ubigeo mal escrito no es uno sin vigencia. */
export function exigirFormatoDeUbigeo(ubigeo: string): void {
  if (!FORMA_UBIGEO.test(ubigeo)) throw new DireccionInvalidaError('El ubigeo debe tener 6 dígitos');
}
