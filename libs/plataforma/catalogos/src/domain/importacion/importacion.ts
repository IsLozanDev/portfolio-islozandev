import { AggregateRoot } from '@vitrina/plataforma/kernel';
import type { Diferencias } from './calcular-diferencias.js';
import { ImportacionNoAplicableError } from './errores.js';
import type { FilaImportada } from './fila-importada.js';
import { HORAS_MAXIMAS_EN_COLA, HORAS_VIGENCIA_PREVISUALIZACION, type ErrorFila, type EstadoImportacion } from './tipos.js';

const MILISEGUNDOS_POR_HORA = 3_600_000;
const MOTIVO_MAXIMO = 300;
const MOTIVO_TRABAJO_PERDIDO = 'Trabajo perdido en la cola';
const ESTADOS_FINALES: readonly EstadoImportacion[] = ['RECHAZADA', 'APLICADA', 'FALLIDA', 'OBSOLETA', 'VENCIDA'];
/** Igual que el DEFAULT de `cat.importacion.version`. */
export const VERSION_INICIAL_IMPORTACION = 0;

export interface ResumenImportacion {
  altas: number;
  cambios: number;
  bajas: number;
  sinCambios: number;
}

/** Lo que aplica el worker: filas normalizadas, no el archivo. */
export interface OperacionesImportacion {
  altas: FilaImportada[];
  cambios: { itemId: string; fila: FilaImportada }[];
  bajas: string[];
}

export interface ImportacionProps {
  tenantId: string;
  catalogoId: string;
  versionOficial: string;
  fechaVigencia: string;
  archivoNombre: string;
  archivoSha256: string;
  /** `cat.catalogo.version` al previsualizar. */
  versionCatalogo: number;
  estado: EstadoImportacion;
  resumen: ResumenImportacion;
  operaciones: OperacionesImportacion | null;
  totalErrores: number;
  errores: ErrorFila[] | null;
  motivoFallo: string | null;
  lanzadoPor: string;
  creadoEn: Date;
  encoladoEn: Date | null;
  aplicadoPor: string | null;
  terminadoEn: Date | null;
}

export interface DatosArchivoImportado {
  id: string;
  tenantId: string;
  catalogoId: string;
  versionOficial: string;
  fechaVigencia: string;
  archivoNombre: string;
  archivoSha256: string;
  versionCatalogo: number;
  lanzadoPor: string;
  ahora: Date;
}

const SIN_DIFERENCIAS: ResumenImportacion = { altas: 0, cambios: 0, bajas: 0, sinCambios: 0 };

/** Traza de una importación de tabla oficial (TR-RF-028, TR-RNF-013). La aplica el worker en una transacción. */
export class Importacion extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: ImportacionProps,
  ) {
    super(id, version);
  }

  static previsualizar(datos: DatosArchivoImportado & { diferencias: Diferencias }): Importacion {
    const { diferencias } = datos;
    return Importacion.nueva(datos, {
      estado: 'PREVISUALIZADA',
      resumen: {
        altas: diferencias.altas.length,
        cambios: diferencias.cambios.length,
        bajas: diferencias.bajas.length,
        sinCambios: diferencias.sinCambios,
      },
      operaciones: {
        altas: diferencias.altas,
        cambios: diferencias.cambios.map((cambio) => ({ itemId: cambio.antes.id, fila: cambio.despues })),
        bajas: diferencias.bajas.map((item) => item.id),
      },
      totalErrores: 0,
      errores: null,
    });
  }

  /** Estado final: ningún ítem se toca y los errores quedan para el reporte. */
  static rechazar(datos: DatosArchivoImportado & { errores: readonly ErrorFila[]; totalErrores: number }): Importacion {
    return Importacion.nueva(datos, {
      estado: 'RECHAZADA',
      resumen: SIN_DIFERENCIAS,
      operaciones: null,
      totalErrores: datos.totalErrores,
      errores: [...datos.errores],
    });
  }

  static reconstituir(id: string, version: number, props: ImportacionProps): Importacion {
    return new Importacion(id, version, { ...props });
  }

  private static nueva(
    datos: DatosArchivoImportado,
    contenido: Pick<ImportacionProps, 'estado' | 'resumen' | 'operaciones' | 'totalErrores' | 'errores'>,
  ): Importacion {
    return new Importacion(datos.id, VERSION_INICIAL_IMPORTACION, {
      tenantId: datos.tenantId,
      catalogoId: datos.catalogoId,
      versionOficial: datos.versionOficial,
      fechaVigencia: datos.fechaVigencia,
      archivoNombre: datos.archivoNombre,
      archivoSha256: datos.archivoSha256,
      versionCatalogo: datos.versionCatalogo,
      ...contenido,
      motivoFallo: null,
      lanzadoPor: datos.lanzadoPor,
      creadoEn: datos.ahora,
      encoladoEn: null,
      aplicadoPor: null,
      terminadoEn: null,
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get catalogoId(): string {
    return this.props.catalogoId;
  }

  get versionOficial(): string {
    return this.props.versionOficial;
  }

  get fechaVigencia(): string {
    return this.props.fechaVigencia;
  }

  get archivoNombre(): string {
    return this.props.archivoNombre;
  }

  get archivoSha256(): string {
    return this.props.archivoSha256;
  }

  get versionCatalogo(): number {
    return this.props.versionCatalogo;
  }

  get estado(): EstadoImportacion {
    return this.props.estado;
  }

  get resumen(): ResumenImportacion {
    return this.props.resumen;
  }

  get operaciones(): OperacionesImportacion | null {
    return this.props.operaciones;
  }

  get totalErrores(): number {
    return this.props.totalErrores;
  }

  get errores(): readonly ErrorFila[] | null {
    return this.props.errores;
  }

  get motivoFallo(): string | null {
    return this.props.motivoFallo;
  }

  get lanzadoPor(): string {
    return this.props.lanzadoPor;
  }

  get creadoEn(): Date {
    return this.props.creadoEn;
  }

  get encoladoEn(): Date | null {
    return this.props.encoladoEn;
  }

  get aplicadoPor(): string | null {
    return this.props.aplicadoPor;
  }

  get terminadoEn(): Date | null {
    return this.props.terminadoEn;
  }

  get venceEn(): Date {
    return new Date(this.props.creadoEn.getTime() + HORAS_VIGENCIA_PREVISUALIZACION * MILISEGUNDOS_POR_HORA);
  }

  get esFinal(): boolean {
    return ESTADOS_FINALES.includes(this.props.estado);
  }

  /** PREVISUALIZADA -> EN_COLA. false si pasaron 24 h: queda VENCIDA y no se encola. */
  encolar(por: string, ahora: Date): boolean {
    this.exigirEstado('PREVISUALIZADA');
    if (ahora.getTime() >= this.venceEn.getTime()) {
      this.vencer(ahora);
      return false;
    }
    this.props = { ...this.props, estado: 'EN_COLA', aplicadoPor: por, encoladoEn: ahora };
    return true;
  }

  /** EN_COLA -> PREVISUALIZADA, cuando la cola no aceptó el trabajo. */
  devolverAPrevisualizada(): void {
    this.exigirEstado('EN_COLA');
    this.props = { ...this.props, estado: 'PREVISUALIZADA', aplicadoPor: null, encoladoEn: null };
  }

  /** EN_COLA -> FALLIDA. El motivo no lleva datos personales. */
  marcarFallida(motivo: string, ahora: Date): void {
    this.terminarEnCola('FALLIDA', ahora, motivo.slice(0, MOTIVO_MAXIMO));
  }

  /** EN_COLA desde hace más de HORAS_MAXIMAS_EN_COLA -> FALLIDA: el trabajo se perdió en Redis. */
  revisarPerdida(ahora: Date): boolean {
    const { estado, encoladoEn } = this.props;
    if (estado !== 'EN_COLA' || encoladoEn === null) return false;
    if (ahora.getTime() - encoladoEn.getTime() <= HORAS_MAXIMAS_EN_COLA * MILISEGUNDOS_POR_HORA) return false;
    this.marcarFallida(MOTIVO_TRABAJO_PERDIDO, ahora);
    return true;
  }

  /** EN_COLA -> OBSOLETA: el catálogo cambió desde la previsualización. */
  marcarObsoleta(ahora: Date): void {
    this.terminarEnCola('OBSOLETA', ahora, null);
  }

  /** PREVISUALIZADA o RECHAZADA -> VENCIDA. Libera las operaciones y los errores. */
  vencer(ahora: Date): void {
    if (this.props.estado !== 'PREVISUALIZADA' && this.props.estado !== 'RECHAZADA') {
      throw new ImportacionNoAplicableError(this.props.estado);
    }
    this.props = { ...this.props, estado: 'VENCIDA', operaciones: null, errores: null, terminadoEn: ahora };
  }

  private terminarEnCola(estado: 'FALLIDA' | 'OBSOLETA', ahora: Date, motivo: string | null): void {
    this.exigirEstado('EN_COLA');
    this.props = { ...this.props, estado, operaciones: null, motivoFallo: motivo, terminadoEn: ahora };
  }

  private exigirEstado(esperado: EstadoImportacion): void {
    if (this.props.estado !== esperado) throw new ImportacionNoAplicableError(this.props.estado);
  }
}
