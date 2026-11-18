import { AggregateRoot, ConflictError } from '@vitrina/plataforma/kernel';
import type { CategoriaArchivo } from './categoria.js';
import { DatosArchivoInvalidosError, MimeNoPermitidoError, TamanoExcedidoError } from './errores.js';
import {
  AGREGADO_ARCHIVO,
  EVENTOS_ARC,
  VERSION_ESQUEMA_ARC,
  type ArchivoDisponible,
  type ArchivoEnCuarentena,
} from './eventos-arc.js';

export const ESTADOS_ARCHIVO = ['PENDIENTE_CARGA', 'EN_ANALISIS', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;
export type EstadoArchivo = (typeof ESTADOS_ARCHIVO)[number];

export const MOTIVOS_RECHAZO = ['TIPO_NO_PERMITIDO', 'TAMANO_NO_COINCIDE'] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

const NOMBRE_MAXIMO = 255;
const ENTIDAD_ID_MAXIMO = 80;
const FORMATO_ENTIDAD_TIPO = /^[A-Z][A-Z0-9_]{1,39}$/;
const NUMERO_PRIMERA_VERSION = 1;
/** El archivo nace en versión 1, como el DEFAULT de `arc.archivo.version`: solicitar no publica evento. */
const VERSION_AL_SOLICITAR = 1;

/** `hashSha256`, `bytes` y `mimeReal` quedan nulos hasta que el worker analiza los bytes. */
export interface VersionArchivo {
  numero: number;
  rutaStorage: string;
  mimeDeclarado: string;
  bytesDeclarados: number;
  hashSha256: string | null;
  bytes: number | null;
  mimeReal: string | null;
  subidoPor: string;
}

export interface ArchivoProps {
  tenantId: string;
  categoria: string;
  entidadTipo: string;
  entidadId: string;
  nombreOriginal: string;
  estado: EstadoArchivo;
  motivoRechazo: MotivoRechazo | null;
  versionVigente: number | null;
  creadoPor: string;
  primeraVersion: VersionArchivo;
}

export interface DatosSolicitudCarga {
  id: string;
  tenantId: string;
  nombreOriginal: string;
  mimeDeclarado: string;
  bytesDeclarados: number;
  entidadTipo: string;
  entidadId: string;
  solicitadoPor: string;
}

/** Lo que el análisis midió sobre el contenido real. */
export interface ContenidoAnalizado {
  hash: string;
  bytes: number;
  mimeReal: string;
}

export interface ContenidoInfectado extends ContenidoAnalizado {
  firma: string;
}

type ReferenciaEnEvento = Pick<ArchivoDisponible, 'archivo_id' | 'categoria' | 'entidad_tipo' | 'entidad_id'>;

/** Un archivo del tenant asociado a una entidad, con su versión 1 (TR-RF-080). Las versiones llegan con el spec 35. */
export class Archivo extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private readonly props: ArchivoProps,
  ) {
    super(id, version);
  }

  static solicitar(datos: DatosSolicitudCarga, categoria: CategoriaArchivo): Archivo {
    const nombreOriginal = exigirTexto(datos.nombreOriginal, NOMBRE_MAXIMO, 'nombre');
    if (!categoria.admiteMime(datos.mimeDeclarado)) throw new MimeNoPermitidoError();
    exigirTamano(datos.bytesDeclarados, categoria);
    if (!FORMATO_ENTIDAD_TIPO.test(datos.entidadTipo)) {
      throw new DatosArchivoInvalidosError('El tipo de entidad va en mayúsculas, con dígitos o guion bajo, de 2 a 40 caracteres');
    }
    return new Archivo(datos.id, VERSION_AL_SOLICITAR, {
      tenantId: datos.tenantId,
      categoria: categoria.codigo,
      entidadTipo: datos.entidadTipo,
      entidadId: exigirTexto(datos.entidadId, ENTIDAD_ID_MAXIMO, 'identificador de la entidad'),
      nombreOriginal,
      estado: 'PENDIENTE_CARGA',
      motivoRechazo: null,
      versionVigente: null,
      creadoPor: datos.solicitadoPor,
      primeraVersion: {
        numero: NUMERO_PRIMERA_VERSION,
        rutaStorage: armarRutaStorage(datos.tenantId, datos.id, NUMERO_PRIMERA_VERSION),
        mimeDeclarado: datos.mimeDeclarado,
        bytesDeclarados: datos.bytesDeclarados,
        hashSha256: null,
        bytes: null,
        mimeReal: null,
        subidoPor: datos.solicitadoPor,
      },
    });
  }

  static reconstituir(id: string, version: number, props: ArchivoProps): Archivo {
    return new Archivo(id, version, { ...props, primeraVersion: { ...props.primeraVersion } });
  }

  /** Idempotente: devuelve `false` y no cambia nada si el archivo ya no está pendiente de carga. */
  confirmarCarga(): boolean {
    if (this.props.estado !== 'PENDIENTE_CARGA') return false;
    this.props.estado = 'EN_ANALISIS';
    return true;
  }

  aprobar(contenido: ContenidoAnalizado): void {
    this.exigirEnAnalisis();
    this.registrarContenido(contenido);
    this.props.estado = 'DISPONIBLE';
    this.props.versionVigente = this.props.primeraVersion.numero;
    const payload: ArchivoDisponible = {
      ...this.referenciaEnEvento(),
      version: this.props.primeraVersion.numero,
      hash_sha256: contenido.hash,
      bytes: contenido.bytes,
      mime_real: contenido.mimeReal,
    };
    this.publicar(EVENTOS_ARC.disponible, payload);
  }

  /** Sin evento: el objeto se borra de Storage y nadie más lo llega a ver. */
  rechazar(motivo: MotivoRechazo): void {
    this.exigirEnAnalisis();
    this.props.estado = 'RECHAZADO';
    this.props.motivoRechazo = motivo;
  }

  /** El objeto se conserva en Storage para revisar un falso positivo. */
  ponerEnCuarentena(contenido: ContenidoInfectado): void {
    this.exigirEnAnalisis();
    this.registrarContenido(contenido);
    this.props.estado = 'CUARENTENA';
    const payload: ArchivoEnCuarentena = { ...this.referenciaEnEvento(), firma: contenido.firma };
    this.publicar(EVENTOS_ARC.enCuarentena, payload);
  }

  /** El cliente confirmó sin haber subido el objeto: puede reintentar mientras la URL de carga viva. */
  devolverAPendiente(): void {
    this.exigirEnAnalisis();
    this.props.estado = 'PENDIENTE_CARGA';
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get categoria(): string {
    return this.props.categoria;
  }

  get entidadTipo(): string {
    return this.props.entidadTipo;
  }

  get entidadId(): string {
    return this.props.entidadId;
  }

  get nombreOriginal(): string {
    return this.props.nombreOriginal;
  }

  get estado(): EstadoArchivo {
    return this.props.estado;
  }

  get motivoRechazo(): MotivoRechazo | null {
    return this.props.motivoRechazo;
  }

  get versionVigente(): number | null {
    return this.props.versionVigente;
  }

  get creadoPor(): string {
    return this.props.creadoPor;
  }

  get primeraVersion(): Readonly<VersionArchivo> {
    return this.props.primeraVersion;
  }

  private exigirEnAnalisis(): void {
    if (this.props.estado !== 'EN_ANALISIS') {
      throw new ConflictError(`El archivo no está en análisis: ${this.props.estado}`);
    }
  }

  private registrarContenido(contenido: ContenidoAnalizado): void {
    this.props.primeraVersion.hashSha256 = contenido.hash;
    this.props.primeraVersion.bytes = contenido.bytes;
    this.props.primeraVersion.mimeReal = contenido.mimeReal;
  }

  private referenciaEnEvento(): ReferenciaEnEvento {
    return {
      archivo_id: this.id,
      categoria: this.props.categoria,
      entidad_tipo: this.props.entidadTipo,
      entidad_id: this.props.entidadId,
    };
  }

  private publicar(eventType: string, payload: ArchivoDisponible | ArchivoEnCuarentena): void {
    this.raise({ eventType, aggregateType: AGREGADO_ARCHIVO, schemaVersion: VERSION_ESQUEMA_ARC, payload });
  }
}

/** `{tenant_id}/{archivo_id}/{numero}`, sin el nombre original: la ruta llega a logs de Storage. */
export function armarRutaStorage(tenantId: string, archivoId: string, numeroVersion: number): string {
  return `${tenantId}/${archivoId}/${numeroVersion}`;
}

function exigirTexto(texto: string, maximo: number, campo: string): string {
  const recortado = texto.trim();
  if (recortado.length === 0 || recortado.length > maximo) {
    throw new DatosArchivoInvalidosError(`El campo ${campo} lleva de 1 a ${maximo} caracteres`);
  }
  return recortado;
}

function exigirTamano(bytes: number, categoria: CategoriaArchivo): void {
  if (categoria.admiteTamano(bytes)) return;
  if (Number.isInteger(bytes) && bytes > categoria.tamanoMaxBytes) throw new TamanoExcedidoError(categoria.tamanoMaxBytes);
  throw new DatosArchivoInvalidosError('El tamaño es un número entero de bytes mayor que cero');
}
