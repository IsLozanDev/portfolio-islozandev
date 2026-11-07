import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { etagItems, type LectorItems } from './lector-items.js';
import type { ItemVisible } from './ports/repositorios.js';

export interface DependenciasConsultarItems {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  lector: LectorItems;
}

export interface ConsultarItemsComando {
  catalogo: string;
  /** Cabecera If-None-Match, tal como llegó. */
  siNoCoincide?: string;
}

export type ItemsConsultados = { noModificado: true; etag: string } | { noModificado: false; etag: string; items: ItemVisible[] };

const COMODIN = '*';
const PREFIJO_DEBIL = 'W/';

/**
 * TR-RF-024: ítems vigentes y visibles para el tenant, con ETag. Si el cliente ya tiene la versión, 304 sin
 * leer Redis: el ETag sale de `cat.versiones` (TR-CA-064).
 */
export class ConsultarItems {
  constructor(private readonly dependencias: DependenciasConsultarItems) {}

  ejecutar(comando: ConsultarItemsComando): Promise<ItemsConsultados> {
    const { unidadDeTrabajo, contexto, lector } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const tenantId = contexto.current().tenantId;
      const versiones = await lector.versiones(comando.catalogo, tenantId);
      const fecha = lector.fechaDeHoy();
      const etag = etagItems(versiones, fecha);
      if (coincide(comando.siNoCoincide, etag)) return { noModificado: true, etag };

      const { visibles } = await lector.items(comando.catalogo, tenantId, versiones, fecha);
      return { noModificado: false, etag, items: visibles };
    });
  }
}

/** If-None-Match admite varios ETag separados por coma, débiles (W/) o el comodín. */
function coincide(cabecera: string | undefined, etag: string): boolean {
  if (!cabecera) return false;
  return cabecera
    .split(',')
    .map((valor) => valor.trim())
    .some((valor) => valor === COMODIN || valor.replace(PREFIJO_DEBIL, '') === etag);
}
