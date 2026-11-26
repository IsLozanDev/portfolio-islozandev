import { AggregateRoot, ConflictError } from '@vitrina/plataforma/kernel';
import type { CategoriaArchivo } from './categoria.js';
import {
  ArchivoNoDisponibleError,
  DatosArchivoInvalidosError,
  MimeNoPermitidoError,
  TamanoExcedidoError,
  VersionEnCursoError,
  VersionNoDisponibleError,
  VersionNoEncontradaError,
} from './errores.js';
import {
  AGREGADO_ARCHIVO,
  EVENTOS_ARC,
  VERSION_ESQUEMA_ARC,
  type ArchivoDisponible,
  type ArchivoEnCuarentena,
  type ArchivoVersionCreada,
  type ArchivoVersionVigenteCambiada,
} from './eventos-arc.js';

export const ESTADOS_ARCHIVO = ['PENDIENTE_CARGA', 'EN_ANALISIS', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;
export type CodigoEstadoArchivo = (typeof ESTADOS_ARCHIVO)[number];

/** `RECHAZADO` solo lo lleva la versión 1 (el archivo rechazado): una versión nueva rechazada se borra. */
export const ESTADOS_VERSION = ['PENDIENTE_CARGA', 'EN_ANALISIS', 'DISPONIBLE', 'CUARENTENA', 'RECHAZADO'] as const;
export type CodigoEstadoVersion = (typeof ESTADOS_VERSION)[number];

/** `SISTEMA`: lo genera la plataforma o lo devuelve un tercero de confianza; nace `DISPONIBLE`, sin antivirus ni actor. */
export const ORIGENES_ARCHIVO = ['CARGA', 'SISTEMA'] as const;
export type OrigenArchivo = (typeof ORIGENES_ARCHIVO)[number];

export const MOTIVOS_RECHAZO = ['TIPO_NO_PERMITIDO', 'TAMANO_NO_COINCIDE'] as const;
export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

export const MOTIVOS_RECHAZO_VERSION = ['TIPO_NO_PERMITIDO', 'TAMANO_NO_COINCIDE', 'IDENTICA'] as const;
export type MotivoRechazoVersion = (typeof MOTIVOS_RECHAZO_VERSION)[number];

/** El último intento de versión rechazado. `versionCoincidente` solo con `IDENTICA`. */
export interface RechazoVersion {
  motivo: MotivoRechazoVersion;
  versionCoincidente: number | null;
}

const NOMBRE_MAXIMO = 255;
const ENTIDAD_ID_MAXIMO = 80;
const FORMATO_ENTIDAD_TIPO = /^[A-Z][A-Z0-9_]{1,39}$/;
export const NUMERO_PRIMERA_VERSION = 1;
/** El archivo nace en versión 1, como el DEFAULT de `arc.archivo.version`: solicitar no publica evento. */
const VERSION_AL_SOLICITAR = 1;
const ESTADOS_EN_CURSO: readonly CodigoEstadoVersion[] = ['PENDIENTE_CARGA', 'EN_ANALISIS'];

/**
 * `hashSha256`, `bytes` y `mimeReal` quedan nulos hasta que el worker analiza los bytes. `subidoPor` solo es nulo
 * en un archivo `SISTEMA`.
 */
export interface VersionArchivo {
  numero: number;
  rutaStorage: string;
  estado: CodigoEstadoVersion;
  mimeDeclarado: string;
  bytesDeclarados: number;
  hashSha256: string | null;
  bytes: number | null;
  mimeReal: string | null;
  subidoPor: string | null;
}

export interface ArchivoProps {
  tenantId: string;
  categoria: string;
  entidadTipo: string;
  entidadId: string;
  nombreOriginal: string;
  /** El ciclo de la primera carga: desde que es `DISPONIBLE` no cambia más. */
  estado: CodigoEstadoArchivo;
  motivoRechazo: MotivoRechazo | null;
  versionVigente: number | null;
  origen: OrigenArchivo;
  /** Solo nulo en un archivo `SISTEMA`. */
  creadoPor: string | null;
  /** Siempre trae la versión 1. */
  versiones: VersionArchivo[];
  rechazoVersion: RechazoVersion | null;
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

/** Los bytes ya están en el servidor: el hash y el tamaño se miden antes de crear el archivo. */
export interface DatosArchivoSistema {
  id: string;
  tenantId: string;
  nombreOriginal: string;
  mime: string;
  entidadTipo: string;
  entidadId: string;
  contenido: ContenidoAnalizado;
}

export interface DatosSolicitudVersion {
  mimeDeclarado: string;
  bytesDeclarados: number;
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
type PayloadArc = ArchivoDisponible | ArchivoEnCuarentena | ArchivoVersionCreada | ArchivoVersionVigenteCambiada;

/**
 * Un archivo del tenant asociado a una entidad, con sus versiones (TR-RF-080 y 081). La primera carga mueve
 * a la vez el estado del archivo y el de la versión 1; cada versión nueva lleva su propio ciclo con el
 * archivo `DISPONIBLE`.
 */
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
    exigirMimeYTamano(datos.mimeDeclarado, datos.bytesDeclarados, categoria);
    exigirEntidadTipo(datos.entidadTipo);
    return new Archivo(datos.id, VERSION_AL_SOLICITAR, {
      tenantId: datos.tenantId,
      categoria: categoria.codigo,
      entidadTipo: datos.entidadTipo,
      entidadId: exigirTexto(datos.entidadId, ENTIDAD_ID_MAXIMO, 'identificador de la entidad'),
      nombreOriginal,
      estado: 'PENDIENTE_CARGA',
      motivoRechazo: null,
      versionVigente: null,
      origen: 'CARGA',
      creadoPor: datos.solicitadoPor,
      versiones: [versionPendiente(datos.tenantId, datos.id, NUMERO_PRIMERA_VERSION, datos)],
      rechazoVersion: null,
    });
  }

  /**
   * Un archivo que sube el servidor (spec 52): nace `DISPONIBLE` con la versión 1 vigente, sin pasar por el
   * antivirus, y publica `archivo.disponible`. Se arma en análisis y se aprueba con lo medido para no repetir
   * las reglas y el evento de `aprobar`.
   */
  static delSistema(datos: DatosArchivoSistema, categoria: CategoriaArchivo): Archivo {
    const nombreOriginal = exigirTexto(datos.nombreOriginal, NOMBRE_MAXIMO, 'nombre');
    exigirMimeYTamano(datos.mime, datos.contenido.bytes, categoria);
    exigirEntidadTipo(datos.entidadTipo);
    const primeraVersion = versionPendiente(datos.tenantId, datos.id, NUMERO_PRIMERA_VERSION, {
      mimeDeclarado: datos.mime,
      bytesDeclarados: datos.contenido.bytes,
      solicitadoPor: null,
    });
    const archivo = new Archivo(datos.id, VERSION_AL_SOLICITAR, {
      tenantId: datos.tenantId,
      categoria: categoria.codigo,
      entidadTipo: datos.entidadTipo,
      entidadId: exigirTexto(datos.entidadId, ENTIDAD_ID_MAXIMO, 'identificador de la entidad'),
      nombreOriginal,
      estado: 'EN_ANALISIS',
      motivoRechazo: null,
      versionVigente: null,
      origen: 'SISTEMA',
      creadoPor: null,
      versiones: [{ ...primeraVersion, estado: 'EN_ANALISIS' }],
      rechazoVersion: null,
    });
    archivo.aprobar(datos.contenido);
    return archivo;
  }

  static reconstituir(id: string, version: number, props: ArchivoProps): Archivo {
    return new Archivo(id, version, {
      ...props,
      versiones: props.versiones.map((versionArchivo) => ({ ...versionArchivo })),
      rechazoVersion: props.rechazoVersion && { ...props.rechazoVersion },
    });
  }

  /** Idempotente: devuelve `false` y no cambia nada si el archivo ya no está pendiente de carga. */
  confirmarCarga(): boolean {
    if (this.props.estado !== 'PENDIENTE_CARGA') return false;
    this.moverPrimeraCarga('EN_ANALISIS');
    return true;
  }

  aprobar(contenido: ContenidoAnalizado): void {
    this.exigirEnAnalisis();
    registrarContenido(this.primeraVersionEditable, contenido);
    this.moverPrimeraCarga('DISPONIBLE');
    this.props.versionVigente = NUMERO_PRIMERA_VERSION;
    const payload: ArchivoDisponible = {
      ...this.referenciaEnEvento(),
      version: NUMERO_PRIMERA_VERSION,
      hash_sha256: contenido.hash,
      bytes: contenido.bytes,
      mime_real: contenido.mimeReal,
    };
    this.publicar(EVENTOS_ARC.disponible, payload);
  }

  /** Sin evento: el objeto se borra de Storage y nadie más lo llega a ver. */
  rechazar(motivo: MotivoRechazo): void {
    this.exigirEnAnalisis();
    this.moverPrimeraCarga('RECHAZADO');
    this.props.motivoRechazo = motivo;
  }

  /** El objeto se conserva en Storage para revisar un falso positivo. */
  ponerEnCuarentena(contenido: ContenidoInfectado): void {
    this.exigirEnAnalisis();
    registrarContenido(this.primeraVersionEditable, contenido);
    this.moverPrimeraCarga('CUARENTENA');
    const payload: ArchivoEnCuarentena = { ...this.referenciaEnEvento(), version: NUMERO_PRIMERA_VERSION, firma: contenido.firma };
    this.publicar(EVENTOS_ARC.enCuarentena, payload);
  }

  /** El cliente confirmó sin haber subido el objeto: puede reintentar mientras la URL de carga viva. */
  devolverAPendiente(): void {
    this.exigirEnAnalisis();
    this.moverPrimeraCarga('PENDIENTE_CARGA');
  }

  /**
   * TR-RF-081: una versión nueva de un archivo `DISPONIBLE`, con las mismas reglas de MIME y tamaño de la
   * categoría. Una sola en curso a la vez. Limpia el rechazo del intento anterior.
   */
  solicitarVersion(datos: DatosSolicitudVersion, categoria: CategoriaArchivo): Readonly<VersionArchivo> {
    this.exigirDisponible();
    const enCurso = this.versionEnCurso;
    if (enCurso) throw new VersionEnCursoError(enCurso.numero);
    exigirMimeYTamano(datos.mimeDeclarado, datos.bytesDeclarados, categoria);
    const numero = Math.max(...this.props.versiones.map((versionArchivo) => versionArchivo.numero)) + 1;
    const nueva = versionPendiente(this.props.tenantId, this.id, numero, datos);
    this.props.versiones.push(nueva);
    this.props.rechazoVersion = null;
    return nueva;
  }

  /** Idempotente: devuelve `false` y no cambia nada si la versión ya no está pendiente de carga. */
  confirmarVersion(numero: number): boolean {
    const versionNueva = this.exigirVersionNueva(numero);
    if (versionNueva.estado !== 'PENDIENTE_CARGA') return false;
    versionNueva.estado = 'EN_ANALISIS';
    return true;
  }

  /** Una versión aprobada pasa a vigente sola (TR-RF-081: «incrementa versión»). */
  aprobarVersion(numero: number, contenido: ContenidoAnalizado): void {
    const versionNueva = this.exigirVersionEnAnalisis(numero);
    registrarContenido(versionNueva, contenido);
    versionNueva.estado = 'DISPONIBLE';
    this.props.versionVigente = numero;
    const payload: ArchivoVersionCreada = {
      ...this.referenciaEnEvento(),
      version: numero,
      hash_sha256: contenido.hash,
      bytes: contenido.bytes,
      mime_real: contenido.mimeReal,
    };
    this.publicar(EVENTOS_ARC.versionCreada, payload);
  }

  /** Sin evento: la versión sale del archivo (no consume número) y el motivo queda para quien consulte. */
  rechazarVersion(numero: number, rechazo: RechazoVersion): void {
    this.exigirVersionEnAnalisis(numero);
    this.quitarVersion(numero);
    this.props.rechazoVersion = { ...rechazo };
  }

  /** Consume número y conserva el objeto; el archivo sigue `DISPONIBLE` con su vigente. */
  ponerVersionEnCuarentena(numero: number, contenido: ContenidoInfectado): void {
    const versionNueva = this.exigirVersionEnAnalisis(numero);
    registrarContenido(versionNueva, contenido);
    versionNueva.estado = 'CUARENTENA';
    const payload: ArchivoEnCuarentena = { ...this.referenciaEnEvento(), version: numero, firma: contenido.firma };
    this.publicar(EVENTOS_ARC.enCuarentena, payload);
  }

  devolverVersionAPendiente(numero: number): void {
    this.exigirVersionEnAnalisis(numero).estado = 'PENDIENTE_CARGA';
  }

  /** Limpieza de una versión que nunca se confirmó. `false` si ya no existe o no está pendiente. */
  descartarVersionPendiente(numero: number): boolean {
    if (this.buscarVersionNueva(numero)?.estado !== 'PENDIENTE_CARGA') return false;
    this.quitarVersion(numero);
    return true;
  }

  /** Idempotente: marcar la que ya es vigente devuelve `false` sin evento. */
  marcarVigente(numero: number): boolean {
    this.exigirDisponible();
    const elegida = this.versionNumero(numero);
    if (!elegida) throw new VersionNoEncontradaError();
    if (elegida.estado !== 'DISPONIBLE') throw new VersionNoDisponibleError(elegida.estado);
    // Un archivo DISPONIBLE siempre tiene vigente (ck_archivo_disponible).
    const anterior = this.props.versionVigente ?? NUMERO_PRIMERA_VERSION;
    if (anterior === numero) return false;
    this.props.versionVigente = numero;
    const payload: ArchivoVersionVigenteCambiada = {
      ...this.referenciaEnEvento(),
      version_anterior: anterior,
      version_vigente: numero,
    };
    this.publicar(EVENTOS_ARC.versionVigenteCambiada, payload);
    return true;
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

  get estado(): CodigoEstadoArchivo {
    return this.props.estado;
  }

  get motivoRechazo(): MotivoRechazo | null {
    return this.props.motivoRechazo;
  }

  get versionVigente(): number | null {
    return this.props.versionVigente;
  }

  get origen(): OrigenArchivo {
    return this.props.origen;
  }

  get creadoPor(): string | null {
    return this.props.creadoPor;
  }

  get rechazoVersion(): Readonly<RechazoVersion> | null {
    return this.props.rechazoVersion;
  }

  get primeraVersion(): Readonly<VersionArchivo> {
    return this.primeraVersionEditable;
  }

  /** Por número, de la primera a la última. */
  get versiones(): readonly Readonly<VersionArchivo>[] {
    return [...this.props.versiones].sort((una, otra) => una.numero - otra.numero);
  }

  /** La versión nueva que se está subiendo o analizando, si la hay. La primera carga no cuenta. */
  get versionEnCurso(): Readonly<VersionArchivo> | null {
    return (
      this.props.versiones.find(
        (versionArchivo) => versionArchivo.numero > NUMERO_PRIMERA_VERSION && ESTADOS_EN_CURSO.includes(versionArchivo.estado),
      ) ?? null
    );
  }

  versionNumero(numero: number): Readonly<VersionArchivo> | null {
    return this.props.versiones.find((versionArchivo) => versionArchivo.numero === numero) ?? null;
  }

  /** La versión con ese contenido, para rechazar como `IDENTICA` antes de violar `uq_version_hash`. */
  versionConHash(hash: string): Readonly<VersionArchivo> | null {
    return this.props.versiones.find((versionArchivo) => versionArchivo.hashSha256 === hash) ?? null;
  }

  private get primeraVersionEditable(): VersionArchivo {
    const primera = this.props.versiones.find((versionArchivo) => versionArchivo.numero === NUMERO_PRIMERA_VERSION);
    if (!primera) throw new Error('Un archivo siempre tiene su versión 1');
    return primera;
  }

  private moverPrimeraCarga(estado: CodigoEstadoArchivo): void {
    this.props.estado = estado;
    this.primeraVersionEditable.estado = estado;
  }

  private exigirEnAnalisis(): void {
    if (this.props.estado !== 'EN_ANALISIS') {
      throw new ConflictError(`El archivo no está en análisis: ${this.props.estado}`);
    }
  }

  private exigirDisponible(): void {
    if (this.props.estado !== 'DISPONIBLE') throw new ArchivoNoDisponibleError(this.props.estado);
  }

  /** Las versiones nuevas son las de número mayor que 1: la versión 1 es la primera carga. */
  private buscarVersionNueva(numero: number): VersionArchivo | undefined {
    if (numero <= NUMERO_PRIMERA_VERSION) return undefined;
    return this.props.versiones.find((versionArchivo) => versionArchivo.numero === numero);
  }

  private exigirVersionNueva(numero: number): VersionArchivo {
    const versionNueva = this.buscarVersionNueva(numero);
    if (!versionNueva) throw new VersionNoEncontradaError();
    return versionNueva;
  }

  private exigirVersionEnAnalisis(numero: number): VersionArchivo {
    const versionNueva = this.exigirVersionNueva(numero);
    if (versionNueva.estado !== 'EN_ANALISIS') {
      throw new ConflictError(`La versión ${numero} no está en análisis: ${versionNueva.estado}`);
    }
    return versionNueva;
  }

  private quitarVersion(numero: number): void {
    this.props.versiones = this.props.versiones.filter((versionArchivo) => versionArchivo.numero !== numero);
  }

  private referenciaEnEvento(): ReferenciaEnEvento {
    return {
      archivo_id: this.id,
      categoria: this.props.categoria,
      entidad_tipo: this.props.entidadTipo,
      entidad_id: this.props.entidadId,
    };
  }

  private publicar(eventType: string, payload: PayloadArc): void {
    this.raise({ eventType, aggregateType: AGREGADO_ARCHIVO, schemaVersion: VERSION_ESQUEMA_ARC, payload });
  }
}

/** `{tenant_id}/{archivo_id}/{numero}`, sin el nombre original: la ruta llega a logs de Storage. */
export function armarRutaStorage(tenantId: string, archivoId: string, numeroVersion: number): string {
  return `${tenantId}/${archivoId}/${numeroVersion}`;
}

/** El actor es nulo solo en la versión de un archivo `SISTEMA`. */
type DatosVersionNueva = Omit<DatosSolicitudVersion, 'solicitadoPor'> & { solicitadoPor: string | null };

function versionPendiente(tenantId: string, archivoId: string, numero: number, datos: DatosVersionNueva): VersionArchivo {
  return {
    numero,
    rutaStorage: armarRutaStorage(tenantId, archivoId, numero),
    estado: 'PENDIENTE_CARGA',
    mimeDeclarado: datos.mimeDeclarado,
    bytesDeclarados: datos.bytesDeclarados,
    hashSha256: null,
    bytes: null,
    mimeReal: null,
    subidoPor: datos.solicitadoPor,
  };
}

function exigirEntidadTipo(entidadTipo: string): void {
  if (!FORMATO_ENTIDAD_TIPO.test(entidadTipo)) {
    throw new DatosArchivoInvalidosError('El tipo de entidad va en mayúsculas, con dígitos o guion bajo, de 2 a 40 caracteres');
  }
}

function registrarContenido(versionArchivo: VersionArchivo, contenido: ContenidoAnalizado): void {
  versionArchivo.hashSha256 = contenido.hash;
  versionArchivo.bytes = contenido.bytes;
  versionArchivo.mimeReal = contenido.mimeReal;
}

function exigirTexto(texto: string, maximo: number, campo: string): string {
  const recortado = texto.trim();
  if (recortado.length === 0 || recortado.length > maximo) {
    throw new DatosArchivoInvalidosError(`El campo ${campo} lleva de 1 a ${maximo} caracteres`);
  }
  return recortado;
}

function exigirMimeYTamano(mime: string, bytes: number, categoria: CategoriaArchivo): void {
  if (!categoria.admiteMime(mime)) throw new MimeNoPermitidoError();
  if (categoria.admiteTamano(bytes)) return;
  if (Number.isInteger(bytes) && bytes > categoria.tamanoMaxBytes) throw new TamanoExcedidoError(categoria.tamanoMaxBytes);
  throw new DatosArchivoInvalidosError('El tamaño es un número entero de bytes mayor que cero');
}
