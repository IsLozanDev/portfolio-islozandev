import { ForbiddenError, type DomainEvent, type TenantScope } from '@vitrina/plataforma/kernel';
import type { DependenciasCatalogos } from '../../src/application/dependencias-catalogos.js';
import type {
  AjusteGuardado,
  FilaItemLeido,
  LecturaItems,
  RepositorioAjustes,
  RepositorioCatalogos,
  RepositorioItems,
} from '../../src/application/ports/repositorios.js';
import type { ItemReferenciable } from '../../src/application/ports/verificador-referencias.js';
import type { AjusteItem } from '../../src/domain/ajuste-item.js';
import { Catalogo } from '../../src/domain/catalogo.js';
import { CatalogoDuplicadoError } from '../../src/domain/errores.js';
import { ItemCatalogo } from '../../src/domain/item-catalogo.js';
import type { AlcanceCatalogo, EstadoItem } from '../../src/domain/tipos.js';
import { Vigencia } from '../../src/domain/vigencia.js';

export const OPERADOR = '0193f3a0-0000-7000-8000-000000000001';
export const CLIENTE = '0193f3a0-0000-7000-8000-000000000002';
export const ANA = '0193f3a0-0000-7000-8000-000000000901';
export const AHORA = new Date('2026-11-07T15:00:00Z');

/** Como OperadorRequeridoError de apps/api: 403 con código propio. */
export class OperadorRequeridoDoble extends ForbiddenError {
  override readonly code = 'OPERADOR_REQUERIDO';
}

/** Guarda filas como lo haría la base: versión global del catálogo subida por cada cambio de ítem global. */
export class CatalogosEnMemoria implements RepositorioCatalogos {
  readonly filas = new Map<string, Catalogo>();
  escrituras = 0;

  async buscarPorCodigo(codigo: string) {
    return [...this.filas.values()].find((catalogo) => catalogo.codigo === codigo) ?? null;
  }

  async buscarPorId(id: string) {
    return this.filas.get(id) ?? null;
  }

  async listar() {
    return [...this.filas.values()].sort((uno, otro) => uno.codigo.localeCompare(otro.codigo));
  }

  async crear(catalogo: Catalogo) {
    if (await this.buscarPorCodigo(catalogo.codigo)) throw new CatalogoDuplicadoError();
    this.escrituras += 1;
    this.filas.set(catalogo.id, catalogo);
  }

  async actualizar(catalogo: Catalogo, versionAnterior: number) {
    const guardado = this.filas.get(catalogo.id);
    if (!guardado || guardado.version !== versionAnterior) return false;
    this.escrituras += 1;
    this.reemplazar(catalogo, versionAnterior + 1);
    return true;
  }

  subirVersion(catalogoId: string): void {
    const catalogo = this.filas.get(catalogoId);
    if (catalogo) this.reemplazar(catalogo, catalogo.version + 1);
  }

  private reemplazar(catalogo: Catalogo, version: number): void {
    this.filas.set(
      catalogo.id,
      Catalogo.reconstituir(catalogo.id, version, {
        codigo: catalogo.codigo,
        nombre: catalogo.nombre,
        alcance: catalogo.alcance,
        fuente: catalogo.fuente,
        editablePorTenant: catalogo.editablePorTenant,
        creadoPor: catalogo.creadoPor,
        creadoEn: catalogo.creadoEn,
        modificadoPor: catalogo.modificadoPor,
        modificadoEn: catalogo.modificadoEn,
      }),
    );
  }
}

/** Como cat.version_tenant: la suben los propios y los ajustes de cada tenant. */
export class VersionesTenant {
  private readonly versiones = new Map<string, number>();

  de(catalogoId: string, tenantId: string): number {
    return this.versiones.get(`${catalogoId}|${tenantId}`) ?? 0;
  }

  subir(catalogoId: string, tenantId: string): void {
    this.versiones.set(`${catalogoId}|${tenantId}`, this.de(catalogoId, tenantId) + 1);
  }
}

export class ItemsEnMemoria implements RepositorioItems {
  readonly filas = new Map<string, ItemCatalogo>();
  readonly ajustesBorrados: string[] = [];
  escrituras = 0;

  constructor(
    private readonly catalogos: CatalogosEnMemoria,
    private readonly versionesTenant: VersionesTenant,
    private readonly tenantActual: () => string,
  ) {}

  /** Como la RLS: globales y propios del tenant actual. */
  async buscar(id: string) {
    const item = this.filas.get(id);
    return item && (item.tenantId === null || item.tenantId === this.tenantActual()) ? item : null;
  }

  async existeCodigo(catalogoId: string, tenantId: string | null, codigo: string) {
    return [...this.filas.values()].some(
      (item) => item.catalogoId === catalogoId && item.codigo === codigo && (item.tenantId === null || item.tenantId === tenantId),
    );
  }

  async guardarGlobal(item: ItemCatalogo, versionAnterior: number | null) {
    const guardado = this.filas.get(item.id);
    if (versionAnterior !== null && guardado?.version !== versionAnterior) return false;
    this.escrituras += 1;
    this.filas.set(item.id, reconstituirCon(item, versionAnterior === null ? 0 : versionAnterior + 1));
    this.catalogos.subirVersion(item.catalogoId);
    return true;
  }

  async eliminarGlobal(id: string, version: number) {
    const guardado = this.filas.get(id);
    if (!guardado || guardado.version !== version) return false;
    this.escrituras += 1;
    this.ajustesBorrados.push(id);
    this.filas.delete(id);
    this.catalogos.subirVersion(guardado.catalogoId);
    return true;
  }

  async guardarPropio(item: ItemCatalogo, versionAnterior: number | null) {
    const guardado = this.filas.get(item.id);
    if (versionAnterior !== null && (guardado?.version !== versionAnterior || guardado.tenantId !== this.tenantActual())) return false;
    this.escrituras += 1;
    this.filas.set(item.id, reconstituirCon(item, versionAnterior === null ? 0 : versionAnterior + 1));
    this.versionesTenant.subir(item.catalogoId, this.tenantActual());
    return true;
  }

  async eliminarPropio(id: string, version: number) {
    const guardado = this.filas.get(id);
    if (!guardado || guardado.version !== version || guardado.tenantId !== this.tenantActual()) return false;
    this.escrituras += 1;
    this.filas.delete(id);
    this.versionesTenant.subir(guardado.catalogoId, this.tenantActual());
    return true;
  }
}

/** Ajustes por ítem y tenant. */
export class AjustesEnMemoria implements RepositorioAjustes {
  readonly filas = new Map<string, AjusteGuardado & { por: string }>();
  escrituras = 0;

  constructor(
    private readonly items: ItemsEnMemoria,
    private readonly versionesTenant: VersionesTenant,
    private readonly tenantActual: () => string,
  ) {}

  async buscar(itemId: string) {
    return this.filas.get(this.clave(itemId)) ?? null;
  }

  de(itemId: string, tenantId: string): AjusteGuardado | null {
    return this.filas.get(`${itemId}|${tenantId}`) ?? null;
  }

  async guardar(itemId: string, ajuste: AjusteItem, versionAnterior: number | null, autoria: { por: string; ahora: Date }) {
    const guardado = this.filas.get(this.clave(itemId));
    if ((guardado?.version ?? null) !== versionAnterior) return false;
    this.escrituras += 1;
    this.filas.set(this.clave(itemId), { ajuste, version: versionAnterior === null ? 0 : versionAnterior + 1, por: autoria.por });
    this.subirVersion(itemId);
    return true;
  }

  async borrar(itemId: string) {
    this.escrituras += 1;
    this.filas.delete(this.clave(itemId));
    this.subirVersion(itemId);
  }

  private subirVersion(itemId: string): void {
    const item = this.items.filas.get(itemId);
    if (item) this.versionesTenant.subir(item.catalogoId, this.tenantActual());
  }

  private clave(itemId: string): string {
    return `${itemId}|${this.tenantActual()}`;
  }
}

/** Como cat.versiones: null si el catálogo no existe. */
export class LecturaEnMemoria implements LecturaItems {
  lecturasDeItems = 0;

  constructor(
    private readonly catalogos: CatalogosEnMemoria,
    private readonly versionesTenant: VersionesTenant,
    private readonly guardados: ItemsEnMemoria,
    private readonly ajustes: AjustesEnMemoria,
  ) {}

  async versiones(codigo: string, tenantId: string) {
    const catalogo = await this.catalogos.buscarPorCodigo(codigo);
    if (!catalogo) return null;
    return { catalogoId: catalogo.id, versionGlobal: catalogo.version, versionTenant: this.versionesTenant.de(catalogo.id, tenantId) };
  }

  /** Como cat.items: estado en orden INACTIVO, FUERA_DE_VIGENCIA, OCULTO, VISIBLE; alias y orden del ajuste. */
  async items(codigo: string, tenantId: string, fecha: string): Promise<FilaItemLeido[]> {
    this.lecturasDeItems += 1;
    const catalogo = await this.catalogos.buscarPorCodigo(codigo);
    if (!catalogo) return [];
    return [...this.guardados.filas.values()]
      .filter((item) => item.catalogoId === catalogo.id && (item.tenantId === null || item.tenantId === tenantId))
      .map((item) => filaLeida(item, this.ajustes.de(item.id, tenantId)?.ajuste ?? null, fecha))
      .sort((uno, otro) => uno.orden - otro.orden || uno.nombre.localeCompare(otro.nombre) || uno.codigo.localeCompare(otro.codigo));
  }
}

function filaLeida(item: ItemCatalogo, ajuste: AjusteItem | null, fecha: string): FilaItemLeido {
  return {
    itemId: item.id,
    codigo: item.codigo,
    codigoExterno: item.codigoExterno,
    nombre: ajuste?.alias ?? item.nombre,
    atributos: item.atributos,
    orden: ajuste?.orden ?? item.orden,
    propio: item.tenantId !== null,
    estado: estadoDe(item, ajuste, fecha),
  };
}

function estadoDe(item: ItemCatalogo, ajuste: AjusteItem | null, fecha: string): EstadoItem {
  if (!item.activo) return 'INACTIVO';
  if (!item.vigencia.incluye(fecha)) return 'FUERA_DE_VIGENCIA';
  if (ajuste && !ajuste.visible) return 'OCULTO';
  return 'VISIBLE';
}

function reconstituirCon(item: ItemCatalogo, version: number): ItemCatalogo {
  return ItemCatalogo.reconstituir(item.id, version, {
    catalogoId: item.catalogoId,
    tenantId: item.tenantId,
    codigo: item.codigo,
    codigoExterno: item.codigoExterno,
    nombre: item.nombre,
    abreviatura: item.abreviatura,
    orden: item.orden,
    atributos: item.atributos,
    vigencia: item.vigencia,
    activo: item.activo,
    creadoPor: item.creadoPor,
    creadoEn: item.creadoEn,
    modificadoPor: item.modificadoPor,
    modificadoEn: item.modificadoEn,
  });
}

export interface Escenario {
  dependencias: DependenciasCatalogos;
  catalogos: CatalogosEnMemoria;
  items: ItemsEnMemoria;
  ajustes: AjustesEnMemoria;
  versionesTenant: VersionesTenant;
  publicados: DomainEvent[];
  /** Ítems que el verificador doble da por referenciados. */
  referenciados: Set<string>;
  consultasReferencias: ItemReferenciable[];
  /** Cambia el tenant del contexto (el operador por defecto). */
  comoTenant(tenantId: string): void;
  /** Cambia el instante del reloj (AHORA por defecto). */
  fijarAhora(instante: Date): void;
  lectura: LecturaEnMemoria;
  catalogo(codigo: string, alcance: AlcanceCatalogo): Promise<Catalogo>;
  itemGlobal(catalogo: Catalogo, codigo: string): Promise<ItemCatalogo>;
}

export function escenario(): Escenario {
  let alcance: TenantScope = { tenantId: OPERADOR };
  const tenantActual = () => alcance.tenantId;
  const catalogos = new CatalogosEnMemoria();
  const versionesTenant = new VersionesTenant();
  const items = new ItemsEnMemoria(catalogos, versionesTenant, tenantActual);
  const ajustes = new AjustesEnMemoria(items, versionesTenant, tenantActual);
  const lectura = new LecturaEnMemoria(catalogos, versionesTenant, items, ajustes);
  let ahora = AHORA;
  const publicados: DomainEvent[] = [];
  const referenciados = new Set<string>();
  const consultasReferencias: ItemReferenciable[] = [];
  const enTransaccion = { activa: false };
  let siguienteId = 0;

  const dependencias: DependenciasCatalogos = {
    unidadDeTrabajo: {
      run: async (trabajo) => {
        enTransaccion.activa = true;
        try {
          return await trabajo();
        } finally {
          enTransaccion.activa = false;
        }
      },
    },
    contexto: { current: () => alcance, run: (_alcance, trabajo) => trabajo() },
    ids: { next: () => `0193f3a0-0000-7000-8000-00000000e${String(++siguienteId).padStart(3, '0')}` },
    reloj: { now: () => ahora },
    eventos: {
      publish: async (evento) => {
        if (!enTransaccion.activa) throw new Error('el evento debía publicarse dentro de la transacción');
        publicados.push(evento);
      },
    },
    catalogos,
    items,
    ajustes,
    lectura,
    verificadorOperador: {
      exigir: async (tenantId) => {
        if (tenantId !== OPERADOR) throw new OperadorRequeridoDoble('Solo el tenant operador puede administrar catálogos globales');
      },
    },
    verificadoresReferencias: [
      {
        estaReferenciado: async (item) => {
          consultasReferencias.push(item);
          return referenciados.has(item.itemId);
        },
      },
    ],
  };

  return {
    dependencias,
    catalogos,
    items,
    ajustes,
    versionesTenant,
    publicados,
    referenciados,
    consultasReferencias,
    lectura,
    fijarAhora: (instante) => {
      ahora = instante;
    },
    comoTenant: (tenantId) => {
      alcance = { tenantId };
    },
    catalogo: async (codigo, alcanceCatalogo) => {
      const catalogo = Catalogo.crear({
        id: `0193f3a0-0000-7000-8000-0000000c${String(catalogos.filas.size + 1).padStart(4, '0')}`,
        codigo,
        nombre: `Catálogo ${codigo}`,
        alcance: alcanceCatalogo,
        fuente: null,
        editablePorTenant: alcanceCatalogo !== 'GLOBAL',
        por: ANA,
        ahora: AHORA,
      });
      await catalogos.crear(catalogo);
      return catalogo;
    },
    itemGlobal: async (catalogo, codigo) => {
      const item = ItemCatalogo.crear({
        id: `0193f3a0-0000-7000-8000-0000000d${String(items.filas.size + 1).padStart(4, '0')}`,
        catalogo,
        tenantId: null,
        codigo,
        codigoExterno: null,
        nombre: codigo,
        abreviatura: null,
        orden: 0,
        atributos: {},
        vigencia: Vigencia.de('2026-01-01', null),
        activo: true,
        por: ANA,
        ahora: AHORA,
      });
      await items.guardarGlobal(item, null);
      return item;
    },
  };
}
