import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aUbigeo, type ItemUbigeoRespuesta, type Ubigeo } from '../models/ubigeo';
import { solicitar } from '../utils/solicitar';

export const RUTA_ITEMS_UBIGEO = '/catalogos/UBIGEO/items';

type EstadoUbigeos = 'SIN_CARGAR' | 'CARGANDO' | 'LISTO' | 'ERROR';

/**
 * Los distritos del catálogo `UBIGEO`, pedidos una vez por sesión (exige `plat.catalogo.leer`). La API responde
 * con `ETag` y `Cache-Control`: el navegador revalida sin volver a bajar la lista.
 */
@Injectable({ providedIn: 'root' })
export class UbigeosService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(CONFIG_AUTH).apiUrl + RUTA_ITEMS_UBIGEO;
  private readonly lista = signal<readonly Ubigeo[]>([]);
  private readonly estadoCarga = signal<EstadoUbigeos>('SIN_CARGAR');
  private pendiente: Promise<void> | null = null;

  readonly ubigeos = this.lista.asReadonly();
  readonly estado = this.estadoCarga.asReadonly();
  readonly listos = computed(() => this.estadoCarga() === 'LISTO');

  /** Idempotente: una sola petición aunque varios componentes la pidan; tras un error se puede reintentar. */
  cargar(): Promise<void> {
    if (this.estadoCarga() === 'LISTO') return Promise.resolve();
    this.pendiente ??= this.pedir();
    return this.pendiente;
  }

  private async pedir(): Promise<void> {
    this.estadoCarga.set('CARGANDO');
    try {
      const items = await solicitar(this.http.get<ItemUbigeoRespuesta[]>(this.url));
      this.lista.set(items.flatMap((item) => aUbigeo(item) ?? []));
      this.estadoCarga.set('LISTO');
    } catch (error) {
      this.estadoCarga.set('ERROR');
      throw error;
    } finally {
      this.pendiente = null;
    }
  }
}
