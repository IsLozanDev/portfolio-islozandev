import type { DomainEvent } from '@vitrina/plataforma/kernel';

/** Eventos de cat en el outbox, en schema_version 1. */
export const EVENTOS_CAT = {
  catalogoActualizado: 'catalogo.actualizado',
  importacionAplicada: 'catalogo.importacion_aplicada',
  feriadoActualizado: 'feriado.actualizado',
} as const;

export const AGREGADO_CATALOGO = 'catalogo';
const VERSION_ESQUEMA = 1;

/** IMPORTACION (spec 19b) no cambia schema_version: los consumidores ignoran los valores que no conocen. */
export type CambioCatalogo = 'CATALOGO' | 'ITEM' | 'AJUSTE' | 'IMPORTACION';

/** Sin nombres ni correos (TR-RNF-026). Las versiones son las que quedan tras el cambio. */
export interface CatalogoActualizado {
  catalogo_id: string;
  codigo: string;
  version_global: number;
  version_tenant: number;
  /** null en cambios globales. */
  tenant_id: string | null;
  cambio: CambioCatalogo;
  /** null si el cambio es de la definición. */
  item_id: string | null;
  por: string;
}

export interface DatosCatalogoActualizado {
  catalogoId: string;
  codigo: string;
  versionGlobal: number;
  versionTenant: number;
  tenantId: string | null;
  cambio: CambioCatalogo;
  itemId: string | null;
  por: string;
  ahora: Date;
}

/**
 * Las versiones las suben la base y sus triggers: el evento se arma después de escribir, con lo que
 * devolvió la escritura, en vez de salir del agregado. La versión del agregado es la global en un cambio
 * global y la del tenant en uno propio.
 */
export function eventoCatalogoActualizado(datos: DatosCatalogoActualizado): DomainEvent<CatalogoActualizado> {
  return {
    eventType: EVENTOS_CAT.catalogoActualizado,
    aggregateType: AGREGADO_CATALOGO,
    aggregateId: datos.catalogoId,
    aggregateVersion: datos.tenantId === null ? datos.versionGlobal : datos.versionTenant,
    schemaVersion: VERSION_ESQUEMA,
    occurredAt: datos.ahora,
    payload: {
      catalogo_id: datos.catalogoId,
      codigo: datos.codigo,
      version_global: datos.versionGlobal,
      version_tenant: datos.versionTenant,
      tenant_id: datos.tenantId,
      cambio: datos.cambio,
      item_id: datos.itemId,
      por: datos.por,
    },
  };
}

/** Lo que audita el spec 20 de una importación aplicada. Sin nombres ni correos (TR-RNF-026). */
export interface ImportacionAplicada {
  importacion_id: string;
  catalogo_id: string;
  codigo: string;
  version_oficial: string;
  fecha_vigencia: string;
  archivo_sha256: string;
  altas: number;
  cambios: number;
  bajas: number;
  version_global: number;
  por: string;
}

export interface DatosImportacionAplicada {
  importacionId: string;
  catalogoId: string;
  codigo: string;
  versionOficial: string;
  fechaVigencia: string;
  archivoSha256: string;
  altas: number;
  cambios: number;
  bajas: number;
  versionGlobal: number;
  por: string;
  ahora: Date;
}

export function eventoImportacionAplicada(datos: DatosImportacionAplicada): DomainEvent<ImportacionAplicada> {
  return {
    eventType: EVENTOS_CAT.importacionAplicada,
    aggregateType: AGREGADO_CATALOGO,
    aggregateId: datos.catalogoId,
    aggregateVersion: datos.versionGlobal,
    schemaVersion: VERSION_ESQUEMA,
    occurredAt: datos.ahora,
    payload: {
      importacion_id: datos.importacionId,
      catalogo_id: datos.catalogoId,
      codigo: datos.codigo,
      version_oficial: datos.versionOficial,
      fecha_vigencia: datos.fechaVigencia,
      archivo_sha256: datos.archivoSha256,
      altas: datos.altas,
      cambios: datos.cambios,
      bajas: datos.bajas,
      version_global: datos.versionGlobal,
      por: datos.por,
    },
  };
}
