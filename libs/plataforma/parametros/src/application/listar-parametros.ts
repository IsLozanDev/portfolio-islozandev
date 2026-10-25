import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ProductosContratados } from '@vitrina/plataforma/seguridad';
import type { DefinicionParametro } from '../domain/definicion-parametro.js';
import type { BusquedaDefiniciones, ResolucionSql, ValorEfectivo } from './ports/repositorios.js';

/** Los parámetros de plataforma se ven siempre; los de un producto, solo si está contratado. */
const PRODUCTO_PLATAFORMA = 'PLAT';

export interface ListarParametrosConsulta {
  productoCodigo?: string;
  texto?: string;
  incluirObsoletas?: boolean;
}

export interface ParametroListado {
  definicion: DefinicionParametro;
  /** Valor efectivo en la sucursal del contexto (X-Sucursal-Id). */
  efectivo: ValorEfectivo | null;
}

export interface DependenciasListado {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  definiciones: BusquedaDefiniciones;
  resolucion: ResolucionSql;
  productos: ProductosContratados;
}

/** TR-RF-031 paso 1: buscar parámetros por producto o texto, con su valor efectivo. */
export class ListarParametros {
  constructor(private readonly dependencias: DependenciasListado) {}

  ejecutar(consulta: ListarParametrosConsulta = {}): Promise<ParametroListado[]> {
    const { unidadDeTrabajo, contexto, definiciones, resolucion } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const productos = await this.productosVisibles(consulta.productoCodigo);
      const encontradas = await definiciones.listar({ productos, texto: consulta.texto, incluirObsoletas: consulta.incluirObsoletas ?? false });
      const { tenantId, branchId } = contexto.current();
      return Promise.all(
        encontradas.map(async (definicion) => ({
          definicion,
          efectivo: await resolucion.valor(definicion.codigo, tenantId, null, branchId ?? null),
        })),
      );
    });
  }

  private async productosVisibles(productoCodigo: string | undefined): Promise<string[]> {
    const visibles = [PRODUCTO_PLATAFORMA, ...(await this.dependencias.productos.vigentes())];
    if (productoCodigo === undefined) return visibles;
    return visibles.filter((producto) => producto === productoCodigo.toUpperCase());
  }
}
