import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aProveedorFe, CATALOGO_PROVEEDOR_FE, type ItemCatalogoRespuesta, type ProveedorFe } from '../models/proveedor-fe';
import { solicitar } from '../utils/solicitar';

export const RUTA_ITEMS_PROVEEDOR_FE = `/catalogos/${CATALOGO_PROVEEDOR_FE}/items`;

type EstadoProveedores = 'SIN_CARGAR' | 'CARGANDO' | 'LISTO' | 'ERROR';

/** Los proveedores de `PROVEEDOR_FE`, pedidos una vez por sesión (exige `plat.catalogo.leer`). */
@Injectable({ providedIn: 'root' })
export class ProveedoresFeService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(CONFIG_AUTH).apiUrl + RUTA_ITEMS_PROVEEDOR_FE;
  private readonly lista = signal<readonly ProveedorFe[]>([]);
  private readonly estadoCarga = signal<EstadoProveedores>('SIN_CARGAR');
  private pendiente: Promise<void> | null = null;

  readonly proveedores = this.lista.asReadonly();
  readonly estado = this.estadoCarga.asReadonly();

  /** Idempotente: una sola petición aunque la pidan la lista y la página; tras un error se puede reintentar. */
  cargar(): Promise<void> {
    if (this.estadoCarga() === 'LISTO') return Promise.resolve();
    this.pendiente ??= this.pedir();
    return this.pendiente;
  }

  porCodigo(codigo: string): ProveedorFe | null {
    return this.lista().find((proveedor) => proveedor.codigo === codigo) ?? null;
  }

  /**
   * El catálogo lista SIMULADO en todos los ambientes, pero el back lo rechaza donde `FE_SIMULADO_PERMITIDO` es false
   * (PROVEEDOR_FE_INVALIDO): la página lo descarta de la lista al recibir ese error.
   */
  descartar(codigo: string): void {
    this.lista.update((proveedores) => proveedores.filter((proveedor) => proveedor.codigo !== codigo));
  }

  private async pedir(): Promise<void> {
    this.estadoCarga.set('CARGANDO');
    try {
      const items = await solicitar(this.http.get<ItemCatalogoRespuesta[]>(this.url));
      this.lista.set(items.map(aProveedorFe));
      this.estadoCarga.set('LISTO');
    } catch (error) {
      this.estadoCarga.set('ERROR');
      throw error;
    } finally {
      this.pendiente = null;
    }
  }
}
