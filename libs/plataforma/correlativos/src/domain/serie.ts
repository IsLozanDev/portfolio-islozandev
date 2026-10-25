import { AggregateRoot } from '@vitrina/plataforma/kernel';
import type { AmbitoSerie } from './ambito-serie.js';
import { AmbitoSerieInvalidoError, SerieInvalidaError } from './errores.js';
import { EVENTOS_SEQ, type SerieCreada, type SerieEstadoCambiado } from './eventos.js';
import {
  DIGITOS_COMPROBANTE,
  DIGITOS_MAXIMOS,
  DIGITOS_MINIMOS,
  DIGITOS_POR_DEFECTO,
  esComprobante,
  type Reinicio,
  type TipoDocumento,
} from './tipos.js';

const FORMATO_SERIE = /^[A-Z0-9]{1,10}$/;
const FORMATO_POR_TIPO: Partial<Record<TipoDocumento, { patron: RegExp; mensaje: string }>> = {
  FACTURA: { patron: /^F[A-Z0-9]{3}$/, mensaje: 'Las series de factura deben iniciar con F y tener 4 caracteres' },
  BOLETA: { patron: /^B[A-Z0-9]{3}$/, mensaje: 'Las series de boleta deben iniciar con B y tener 4 caracteres' },
  NOTA_CREDITO: { patron: /^[FB][A-Z0-9]{3}$/, mensaje: 'Las series de notas deben iniciar con F o B y tener 4 caracteres' },
  NOTA_DEBITO: { patron: /^[FB][A-Z0-9]{3}$/, mensaje: 'Las series de notas deben iniciar con F o B y tener 4 caracteres' },
};

export interface SerieProps {
  tenantId: string;
  ambito: AmbitoSerie;
  tipo: TipoDocumento;
  codigo: string;
  digitos: number;
  reinicio: Reinicio;
  /** Último número emitido al crear. Después solo avanza en `seq.siguiente`, fuera del agregado. */
  ultimoNumero: number;
  activa: boolean;
  creadoPor: string;
  creadoEn: Date;
  modificadoPor: string;
  modificadoEn: Date;
}

export interface DatosNuevaSerie {
  id: string;
  tenantId: string;
  ambito: AmbitoSerie;
  tipo: TipoDocumento;
  codigo: string;
  digitos?: number;
  reinicio: Reinicio;
  ultimoNumero: number;
  por: string;
  ahora: Date;
}

/** Serie de numeración de una empresa (TR-RF-035). El periodo lo fija la base con `seq.periodo_de`. */
export class Serie extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: SerieProps,
  ) {
    super(id, version);
  }

  static crear(datos: DatosNuevaSerie): Serie {
    const digitos = datos.digitos ?? DIGITOS_POR_DEFECTO;
    validarCodigo(datos.tipo, datos.codigo);
    validarComprobante(datos.tipo, digitos, datos.ambito);
    validarDigitos(digitos);
    validarUltimoNumero(datos.ultimoNumero, digitos);

    const serie = new Serie(datos.id, 0, {
      tenantId: datos.tenantId,
      ambito: datos.ambito,
      tipo: datos.tipo,
      codigo: datos.codigo,
      digitos,
      reinicio: datos.reinicio,
      ultimoNumero: datos.ultimoNumero,
      activa: true,
      creadoPor: datos.por,
      creadoEn: datos.ahora,
      modificadoPor: datos.por,
      modificadoEn: datos.ahora,
    });
    serie.publicarCreada();
    return serie;
  }

  static reconstituir(id: string, version: number, props: SerieProps): Serie {
    return new Serie(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get ambito(): AmbitoSerie {
    return this.props.ambito;
  }

  get tipo(): TipoDocumento {
    return this.props.tipo;
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get digitos(): number {
    return this.props.digitos;
  }

  get reinicio(): Reinicio {
    return this.props.reinicio;
  }

  get ultimoNumero(): number {
    return this.props.ultimoNumero;
  }

  get activa(): boolean {
    return this.props.activa;
  }

  get creadoPor(): string {
    return this.props.creadoPor;
  }

  get creadoEn(): Date {
    return this.props.creadoEn;
  }

  get modificadoPor(): string {
    return this.props.modificadoPor;
  }

  get modificadoEn(): Date {
    return this.props.modificadoEn;
  }

  /** false si ya está en ese estado: no escribe ni publica (TR-RNF-008). */
  cambiarEstado(activa: boolean, por: string, ahora: Date): boolean {
    if (this.props.activa === activa) return false;
    this.props = { ...this.props, activa, modificadoPor: por, modificadoEn: ahora };
    const payload: SerieEstadoCambiado = { serie_id: this.id, tipo: this.props.tipo, serie: this.props.codigo, activa, por };
    this.raise({ eventType: EVENTOS_SEQ.serieEstadoCambiado, aggregateType: 'serie', schemaVersion: 1, payload });
    return true;
  }

  private publicarCreada(): void {
    const payload: SerieCreada = {
      serie_id: this.id,
      empresa_id: this.props.ambito.empresaId,
      sucursal_id: this.props.ambito.sucursalId,
      unidad_id: this.props.ambito.unidadId,
      tipo: this.props.tipo,
      serie: this.props.codigo,
      digitos: this.props.digitos,
      reinicio: this.props.reinicio,
      ultimo_numero: this.props.ultimoNumero,
      por: this.props.creadoPor,
    };
    this.raise({ eventType: EVENTOS_SEQ.serieCreada, aggregateType: 'serie', schemaVersion: 1, payload });
  }
}

function validarCodigo(tipo: TipoDocumento, codigo: string): void {
  if (!FORMATO_SERIE.test(codigo)) {
    throw new SerieInvalidaError('La serie debe tener de 1 a 10 letras mayúsculas o dígitos');
  }
  const formato = FORMATO_POR_TIPO[tipo];
  if (formato && !formato.patron.test(codigo)) throw new SerieInvalidaError(formato.mensaje);
}

function validarComprobante(tipo: TipoDocumento, digitos: number, ambito: AmbitoSerie): void {
  if (!esComprobante(tipo)) return;
  if (digitos !== DIGITOS_COMPROBANTE) throw new SerieInvalidaError('Los comprobantes electrónicos usan 8 dígitos');
  if (ambito.sucursalId === null) {
    throw new AmbitoSerieInvalidoError('Las series de comprobantes se asocian a una sucursal');
  }
}

function validarDigitos(digitos: number): void {
  if (!Number.isInteger(digitos) || digitos < DIGITOS_MINIMOS || digitos > DIGITOS_MAXIMOS) {
    throw new SerieInvalidaError('Los dígitos deben estar entre 1 y 10');
  }
}

/** Con 10 dígitos el máximo es 9 999 999 999: cabe en un entero seguro de JavaScript. */
function validarUltimoNumero(ultimoNumero: number, digitos: number): void {
  const maximoExclusivo = 10 ** digitos;
  if (!Number.isSafeInteger(ultimoNumero) || ultimoNumero < 0 || ultimoNumero >= maximoExclusivo) {
    throw new SerieInvalidaError(`El último número no cabe en ${digitos} dígitos`);
  }
}
