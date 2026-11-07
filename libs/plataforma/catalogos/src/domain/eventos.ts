import type { DomainEvent } from '@vitrina/plataforma/kernel';

/** Eventos de cat en el outbox, en schema_version 1. */
export const EVENTOS_CAT = {
  catalogoActualizado: 'catalogo.actualizado',
} as const;

export const AGREGADO_CATALOGO = 'catalogo';
const VERSION_ESQUEMA = 1;

export type CambioCatalogo = 'CATALOGO' | 'ITEM' | 'AJUSTE';

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
