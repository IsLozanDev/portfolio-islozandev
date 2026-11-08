import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { esBisiesto, exigirFecha } from './calendario.js';
import { FeriadoInvalidoError } from './errores.js';
import type { AlcanceFeriado } from './tipos.js';

const NOMBRE_MINIMO = 3;
const NOMBRE_MAXIMO = 100;
const LARGO_ANIO = 4;
const POSICION_MES_DIA = 5;
const MES_DIA_BISIESTO = '02-29';
/** Igual que el DEFAULT de `cat.feriado.version`. */
export const VERSION_INICIAL_FERIADO = 0;

export interface FeriadoProps {
  alcance: AlcanceFeriado;
  /** null: feriado global. */
  tenantId: string | null;
  /** Solo en feriados de sucursal. */
  sucursalId: string | null;
  /** `YYYY-MM-DD`. Si es recurrente, vale desde ese año. */
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
  /** null en la semilla. */
  creadoPor: string | null;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date;
}

export interface ContenidoFeriado {
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
}

export interface DatosNuevoFeriado extends ContenidoFeriado {
  id: string;
  alcance: AlcanceFeriado;
  tenantId: string | null;
  sucursalId: string | null;
  por: string;
  ahora: Date;
}

/** El alcance y la sucursal llegan solo si el cliente los manda: no se pueden cambiar. */
export interface CambiosFeriado extends ContenidoFeriado {
  alcance?: AlcanceFeriado;
  sucursalId?: string | null;
  por: string;
  ahora: Date;
}

/** Feriado global, del tenant o de una sucursal (TR-RF-029, TR-RN-012). */
export class Feriado extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: FeriadoProps,
  ) {
    super(id, version);
  }

  static crear(datos: DatosNuevoFeriado): Feriado {
    validarSucursal(datos.alcance, datos.sucursalId);
    const contenido = validarContenido(datos);
    return new Feriado(datos.id, VERSION_INICIAL_FERIADO, {
      alcance: datos.alcance,
      tenantId: datos.tenantId,
      sucursalId: datos.sucursalId,
      ...contenido,
      creadoPor: datos.por,
      creadoEn: datos.ahora,
      modificadoPor: datos.por,
      modificadoEn: datos.ahora,
    });
  }

  static reconstituir(id: string, version: number, props: FeriadoProps): Feriado {
    return new Feriado(id, version, { ...props });
  }

  get alcance(): AlcanceFeriado {
    return this.props.alcance;
  }

  get esGlobal(): boolean {
    return this.props.alcance === 'GLOBAL';
  }

  get tenantId(): string | null {
    return this.props.tenantId;
  }

  get sucursalId(): string | null {
    return this.props.sucursalId;
  }

  get fecha(): string {
    return this.props.fecha;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get recurrenteAnual(): boolean {
    return this.props.recurrenteAnual;
  }

  get creadoPor(): string | null {
    return this.props.creadoPor;
  }

  get creadoEn(): Date {
    return this.props.creadoEn;
  }

  get modificadoPor(): string | null {
    return this.props.modificadoPor;
  }

  get modificadoEn(): Date {
    return this.props.modificadoEn;
  }

  get anio(): number {
    return anioDe(this.props.fecha);
  }

  /** `MM-DD` de la fecha. */
  get mesDia(): string {
    return this.props.fecha.slice(POSICION_MES_DIA);
  }

  /** false si no cambia nada: no se escribe ni se publica (TR-RNF-008). */
  actualizar(cambios: CambiosFeriado): boolean {
    this.exigirMismoAlcance(cambios);
    const contenido = validarContenido(cambios);
    if (!this.cambia(contenido)) return false;
    this.props = { ...this.props, ...contenido, modificadoPor: cambios.por, modificadoEn: cambios.ahora };
    return true;
  }

  /** Fecha en que cae en `anio`, o null si ese año no aplica. Un 29 de febrero recurrente solo cae en bisiestos. */
  fechaEnAnio(anio: number): string | null {
    if (!this.props.recurrenteAnual) return anio === this.anio ? this.props.fecha : null;
    if (anio < this.anio) return null;
    if (this.mesDia === MES_DIA_BISIESTO && !esBisiesto(anio)) return null;
    return `${anio}-${this.mesDia}`;
  }

  private exigirMismoAlcance(cambios: CambiosFeriado): void {
    const cambiaAlcance = cambios.alcance !== undefined && cambios.alcance !== this.props.alcance;
    const cambiaSucursal = cambios.sucursalId !== undefined && cambios.sucursalId !== this.props.sucursalId;
    if (cambiaAlcance || cambiaSucursal) throw new FeriadoInvalidoError('El alcance de un feriado no se cambia');
  }

  private cambia(contenido: ContenidoFeriado): boolean {
    return (
      contenido.fecha !== this.props.fecha ||
      contenido.nombre !== this.props.nombre ||
      contenido.recurrenteAnual !== this.props.recurrenteAnual
    );
  }
}

function anioDe(fecha: string): number {
  return Number(fecha.slice(0, LARGO_ANIO));
}

function validarSucursal(alcance: AlcanceFeriado, sucursalId: string | null): void {
  const requiereSucursal = alcance === 'SUCURSAL';
  if (requiereSucursal !== (sucursalId !== null)) {
    throw new FeriadoInvalidoError('La sucursal solo aplica a feriados de sucursal');
  }
}

function validarContenido(contenido: ContenidoFeriado): ContenidoFeriado {
  if (contenido.nombre.length < NOMBRE_MINIMO || contenido.nombre.length > NOMBRE_MAXIMO) {
    throw new FeriadoInvalidoError('El nombre debe tener de 3 a 100 caracteres');
  }
  exigirFecha(contenido.fecha);
  return { fecha: contenido.fecha, nombre: contenido.nombre, recurrenteAnual: contenido.recurrenteAnual };
}
