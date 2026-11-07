import type { DependenciasImportacion } from '../../src/application/importacion/dependencias-importacion.js';
import type { DependenciasProcesarImportacion } from '../../src/application/importacion/procesar-importacion.js';
import type {
  ColaImportaciones,
  EscrituraImportacion,
  ImportacionListada,
  Listado,
  LecturaItemsGlobales,
  Pagina,
  RepositorioImportaciones,
  TipoLote,
  TrabajoImportacion,
} from '../../src/application/ports/importacion.js';
import { CanalAvanceMemoria } from '../../src/infrastructure/canal-avance.memoria.js';
import type { Catalogo } from '../../src/domain/catalogo.js';
import { ImportacionEnCursoError } from '../../src/domain/importacion/errores.js';
import { Importacion, type ImportacionProps } from '../../src/domain/importacion/importacion.js';
import { ItemCatalogo } from '../../src/domain/item-catalogo.js';
import { Vigencia } from '../../src/domain/vigencia.js';
import { LectorTablaArchivos } from '../../src/infrastructure/lectores/lector-tabla.archivos.js';
import { ANA, escenario, type CatalogosEnMemoria, type Escenario, type ItemsEnMemoria } from './dobles.js';

interface Guardada {
  tenantId: string;
  props: ImportacionProps;
  version: number;
}

/** Como la tabla con su RLS: cada tenant ve solo lo suyo y hay una sola EN_COLA por catálogo. */
export class ImportacionesEnMemoria implements RepositorioImportaciones {
  readonly filas = new Map<string, Guardada>();

  constructor(private readonly tenantActual: () => string) {}

  async buscar(id: string) {
    const guardada = this.visible(id);
    return guardada ? Importacion.reconstituir(id, guardada.version, guardada.props) : null;
  }

  async guardar(importacion: Importacion, versionAnterior: number | null) {
    const guardada = this.visible(importacion.id);
    if (versionAnterior !== null && guardada?.version !== versionAnterior) return false;
    const otraEnCola = [...this.filas.entries()].some(
      ([id, fila]) => id !== importacion.id && fila.props.catalogoId === importacion.catalogoId && fila.props.estado === 'EN_COLA',
    );
    if (importacion.estado === 'EN_COLA' && otraEnCola) throw new ImportacionEnCursoError();
    this.filas.set(importacion.id, {
      tenantId: importacion.tenantId,
      props: propsDe(importacion),
      version: versionAnterior === null ? importacion.version : versionAnterior + 1,
    });
    return true;
  }

  async listarPorCatalogo(catalogoId: string, pagina: Pagina): Promise<Listado<ImportacionListada>> {
    const delCatalogo = this.delTenant().filter(([, fila]) => fila.props.catalogoId === catalogoId);
    const inicio = (pagina.pagina - 1) * pagina.tamano;
    return { items: delCatalogo.slice(inicio, inicio + pagina.tamano).map(listada), total: delCatalogo.length };
  }

  async activasDe(usuarioId: string) {
    return this.delTenant()
      .filter(([, fila]) => fila.props.lanzadoPor === usuarioId && fila.props.estado === 'EN_COLA')
      .map(listada);
  }

  async enColaDe(catalogoId: string) {
    const enCola = this.delTenant().find(([, fila]) => fila.props.catalogoId === catalogoId && fila.props.estado === 'EN_COLA');
    return enCola ? Importacion.reconstituir(enCola[0], enCola[1].version, enCola[1].props) : null;
  }

  async vencerPrevias(catalogoId: string, ahora: Date) {
    for (const [, fila] of this.delTenant()) {
      if (fila.props.catalogoId !== catalogoId || !['PREVISUALIZADA', 'RECHAZADA'].includes(fila.props.estado)) continue;
      fila.props = { ...fila.props, estado: 'VENCIDA', operaciones: null, errores: null, terminadoEn: ahora };
      fila.version += 1;
    }
  }

  /** La más reciente primero, como el índice ix_importacion_catalogo. */
  private delTenant(): [string, Guardada][] {
    return [...this.filas.entries()]
      .filter(([, fila]) => fila.tenantId === this.tenantActual())
      .sort(([, una], [, otra]) => otra.props.creadoEn.getTime() - una.props.creadoEn.getTime());
  }

  private visible(id: string): Guardada | undefined {
    const guardada = this.filas.get(id);
    return guardada?.tenantId === this.tenantActual() ? guardada : undefined;
  }
}

function propsDe(importacion: Importacion): ImportacionProps {
  return {
    tenantId: importacion.tenantId,
    catalogoId: importacion.catalogoId,
    versionOficial: importacion.versionOficial,
    fechaVigencia: importacion.fechaVigencia,
    archivoNombre: importacion.archivoNombre,
    archivoSha256: importacion.archivoSha256,
    versionCatalogo: importacion.versionCatalogo,
    estado: importacion.estado,
    resumen: importacion.resumen,
    operaciones: importacion.operaciones,
    totalErrores: importacion.totalErrores,
    errores: importacion.errores ? [...importacion.errores] : null,
    motivoFallo: importacion.motivoFallo,
    lanzadoPor: importacion.lanzadoPor,
    creadoEn: importacion.creadoEn,
    encoladoEn: importacion.encoladoEn,
    aplicadoPor: importacion.aplicadoPor,
    terminadoEn: importacion.terminadoEn,
  };
}

function listada([id, fila]: [string, Guardada]): ImportacionListada {
  const { props } = fila;
  return {
    id,
    catalogoId: props.catalogoId,
    estado: props.estado,
    versionOficial: props.versionOficial,
    fechaVigencia: props.fechaVigencia,
    archivoNombre: props.archivoNombre,
    archivoSha256: props.archivoSha256,
    resumen: props.resumen,
    totalErrores: props.totalErrores,
    motivoFallo: props.motivoFallo,
    lanzadoPor: props.lanzadoPor,
    creadoEn: props.creadoEn,
    aplicadoPor: props.aplicadoPor,
    terminadoEn: props.terminadoEn,
  };
}

/** Los globales que guarda el doble de ítems, como los lee la base. */
export class LecturaGlobalesEnMemoria implements LecturaItemsGlobales {
  constructor(private readonly items: ItemsEnMemoria) {}

  async de(catalogoId: string) {
    return [...this.items.filas.values()]
      .filter((item) => item.catalogoId === catalogoId && item.esGlobal)
      .map((item) => ({
        id: item.id,
        codigo: item.codigo,
        codigoExterno: item.codigoExterno,
        nombre: item.nombre,
        abreviatura: item.abreviatura,
        orden: item.orden,
        atributos: item.atributos,
        vigenteDesde: item.vigencia.desde,
        vigenteHasta: item.vigencia.hasta,
        activo: item.activo,
      }));
  }
}

/** Cola que guarda los trabajos; `caida` simula Redis caído. */
export class ColaEnMemoria implements ColaImportaciones {
  readonly trabajos: TrabajoImportacion[] = [];
  caida = false;

  async encolar(trabajo: TrabajoImportacion) {
    if (this.caida) throw new Error('Connection is closed.');
    this.trabajos.push(trabajo);
  }
}

/**
 * Como las funciones de aplicación de la base, sobre los dobles: `finalizar` sube la versión del catálogo
 * una vez y deja la importación APLICADA. `fallarEnLote` (1, 2, 3…) fuerza un error en ese lote.
 */
export class EscrituraEnMemoria implements EscrituraImportacion {
  readonly lotes: string[] = [];
  iniciarDevuelve = true;
  fallarEnLote: number | null = null;
  bajasCerradas = 0;

  constructor(
    private readonly importaciones: ImportacionesEnMemoria,
    private readonly catalogos: CatalogosEnMemoria,
  ) {}

  async iniciar() {
    return this.iniciarDevuelve;
  }

  async aplicarLote(_importacionId: string, tipo: TipoLote, desde: number, hasta: number) {
    this.lotes.push(`${tipo}:${desde}-${hasta}`);
    if (this.lotes.length === this.fallarEnLote) throw new Error('duplicate key value violates unique constraint "ux_cat_item"');
    return hasta - desde;
  }

  async cerrarBajas(importacionId: string) {
    this.bajasCerradas = this.importaciones.filas.get(importacionId)?.props.resumen.bajas ?? 0;
    return this.bajasCerradas;
  }

  async finalizar(importacionId: string, por: string) {
    const fila = this.importaciones.filas.get(importacionId);
    if (!fila) throw new Error('la importación no existe');
    fila.props = { ...fila.props, estado: 'APLICADA', operaciones: null, aplicadoPor: por };
    fila.version += 1;
    this.catalogos.subirVersion(fila.props.catalogoId);
    return (await this.catalogos.buscarPorId(fila.props.catalogoId))?.version ?? 0;
  }
}

export interface EscenarioImportacion extends Escenario {
  importacion: DependenciasImportacion;
  procesar: DependenciasProcesarImportacion;
  importaciones: ImportacionesEnMemoria;
  cola: ColaEnMemoria;
  canal: CanalAvanceMemoria;
  escritura: EscrituraEnMemoria;
  avisos: Record<string, unknown>[];
  /** Un global con nombre, orden y vigencia propios. */
  global(catalogo: Catalogo, codigo: string, nombre: string, orden: number): Promise<ItemCatalogo>;
}

export function escenarioImportacion(): EscenarioImportacion {
  const base = escenario();
  const tenantActual = () => base.dependencias.contexto.current().tenantId;
  const importaciones = new ImportacionesEnMemoria(tenantActual);
  const cola = new ColaEnMemoria();
  const canal = new CanalAvanceMemoria();
  const escritura = new EscrituraEnMemoria(importaciones, base.catalogos);
  const avisos: Record<string, unknown>[] = [];
  const avisar = (mensaje: string, datos: Record<string, unknown>) => avisos.push({ mensaje, ...datos });
  const { unidadDeTrabajo, contexto, ids, reloj, catalogos, verificadorOperador, eventos } = base.dependencias;
  return {
    ...base,
    importaciones,
    cola,
    canal,
    escritura,
    avisos,
    importacion: {
      unidadDeTrabajo,
      contexto,
      ids,
      reloj,
      catalogos,
      importaciones,
      itemsGlobales: new LecturaGlobalesEnMemoria(base.items),
      lector: new LectorTablaArchivos(),
      verificadorOperador,
      cola,
      canal,
      avisar,
    },
    procesar: { unidadDeTrabajo, contexto, reloj, catalogos, importaciones, escritura, eventos, canal, avisar },
    global: async (catalogo, codigo, nombre, orden) => {
      const item = ItemCatalogo.crear({
        id: `0193f3a0-0000-7000-8000-0000000d${String(base.items.filas.size + 1).padStart(4, '0')}`,
        catalogo,
        tenantId: null,
        codigo,
        codigoExterno: null,
        nombre,
        abreviatura: null,
        orden,
        atributos: {},
        vigencia: Vigencia.de('2026-01-01', null),
        activo: true,
        por: ANA,
        ahora: base.dependencias.reloj.now(),
      });
      await base.items.guardarGlobal(item, null);
      return item;
    },
  };
}
