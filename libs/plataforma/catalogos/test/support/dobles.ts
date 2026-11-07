import { ForbiddenError, type DomainEvent, type TenantScope } from '@vitrina/plataforma/kernel';
import type { DependenciasCatalogos } from '../../src/application/dependencias-catalogos.js';
import type { RepositorioCatalogos, RepositorioItems } from '../../src/application/ports/repositorios.js';
import type { ItemReferenciable } from '../../src/application/ports/verificador-referencias.js';
import { Catalogo } from '../../src/domain/catalogo.js';
import { CatalogoDuplicadoError } from '../../src/domain/errores.js';
import { ItemCatalogo } from '../../src/domain/item-catalogo.js';
import type { AlcanceCatalogo } from '../../src/domain/tipos.js';
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

export class ItemsEnMemoria implements RepositorioItems {
  readonly filas = new Map<string, ItemCatalogo>();
  readonly ajustesBorrados: string[] = [];
  escrituras = 0;

  constructor(private readonly catalogos: CatalogosEnMemoria) {}

  async buscar(id: string) {
    return this.filas.get(id) ?? null;
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
  publicados: DomainEvent[];
  /** Ítems que el verificador doble da por referenciados. */
  referenciados: Set<string>;
  consultasReferencias: ItemReferenciable[];
  /** Cambia el tenant del contexto (el operador por defecto). */
  comoTenant(tenantId: string): void;
  catalogo(codigo: string, alcance: AlcanceCatalogo): Promise<Catalogo>;
  itemGlobal(catalogo: Catalogo, codigo: string): Promise<ItemCatalogo>;
}

export function escenario(): Escenario {
  const catalogos = new CatalogosEnMemoria();
  const items = new ItemsEnMemoria(catalogos);
  const publicados: DomainEvent[] = [];
  const referenciados = new Set<string>();
  const consultasReferencias: ItemReferenciable[] = [];
  const enTransaccion = { activa: false };
  let alcance: TenantScope = { tenantId: OPERADOR };
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
    reloj: { now: () => AHORA },
    eventos: {
      publish: async (evento) => {
        if (!enTransaccion.activa) throw new Error('el evento debía publicarse dentro de la transacción');
        publicados.push(evento);
      },
    },
    catalogos,
    items,
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
    publicados,
    referenciados,
    consultasReferencias,
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
