import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { fechaDeVigencia } from '../domain/vigencia.js';
import type { EstadoItem } from '../domain/tipos.js';
import { buscarCatalogo } from './dependencias-catalogos.js';
import type { FilaAdministracion, FiltroItemsAdministracion, LecturaItemsAdministracion, OrigenItem } from './ports/items-administracion.js';
import type { RepositorioCatalogos } from './ports/repositorios.js';

/** Una fila basta para conocer el total cuando la página pedida queda fuera de rango. */
const LIMITE_SOLO_TOTAL = 1;

export interface DependenciasListarItemsAdministracion {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  catalogos: Pick<RepositorioCatalogos, 'buscarPorCodigo'>;
  lectura: LecturaItemsAdministracion;
}

export interface ListarItemsAdministracionConsulta {
  catalogo: string;
  texto: string | null;
  estado: EstadoItem | null;
  origen: OrigenItem | null;
  /** Desde 1. */
  pagina: number;
  tamano: number;
}

export interface PaginaItemsAdministracion {
  items: FilaAdministracion[];
  total: number;
  pagina: number;
  tamano: number;
}

/**
 * Lista de administración de ítems (apoyo a TR-RF-023, 025 y 026 en la UI del 19d): globales y propios con
 * su estado de hoy en America/Lima y el ajuste del tenant. Sirve igual al operador y a un tenant.
 */
export class ListarItemsAdministracion {
  constructor(private readonly dependencias: DependenciasListarItemsAdministracion) {}

  ejecutar(consulta: ListarItemsAdministracionConsulta): Promise<PaginaItemsAdministracion> {
    const { unidadDeTrabajo, contexto, reloj, catalogos, lectura } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await buscarCatalogo(catalogos, consulta.catalogo);
      const filtro: FiltroItemsAdministracion = {
        codigo: consulta.catalogo,
        tenantId: contexto.current().tenantId,
        fecha: fechaDeVigencia(reloj.now()),
        texto: consulta.texto,
        estado: consulta.estado,
        origen: consulta.origen,
        limite: consulta.tamano,
        desplazamiento: (consulta.pagina - 1) * consulta.tamano,
      };
      const { filas, total } = await lectura.listar(filtro);
      const totalReal = filas.length > 0 || filtro.desplazamiento === 0 ? total : await totalSinPaginar(lectura, filtro);
      return { items: filas, total: totalReal, pagina: consulta.pagina, tamano: consulta.tamano };
    });
  }
}

/** `count(*) OVER ()` no llega si la página no trae filas: se pide con la primera. */
async function totalSinPaginar(lectura: LecturaItemsAdministracion, filtro: FiltroItemsAdministracion): Promise<number> {
  const { total } = await lectura.listar({ ...filtro, limite: LIMITE_SOLO_TOTAL, desplazamiento: 0 });
  return total;
}
