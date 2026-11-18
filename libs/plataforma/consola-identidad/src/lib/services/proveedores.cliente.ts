import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aCuerpoCambiosProveedor, aProveedor, type CambiosProveedor, type Proveedor, type ProveedorRespuesta } from '../models/proveedor';
import { solicitar } from '../utils/solicitar';

export const RUTA_PROVEEDORES = '/identidad/proveedores';

/** Proveedores DNI/RUC (spec 29, solo operador). Sin credenciales. Los errores salen como `ErrorIdentidad`. */
@Injectable({ providedIn: 'root' })
export class ProveedoresCliente {
  private readonly http = inject(HttpClient);
  private readonly urlProveedores = inject(CONFIG_AUTH).apiUrl + RUTA_PROVEEDORES;

  /** Por prioridad, como los devuelve la API. */
  async listar(): Promise<Proveedor[]> {
    return (await solicitar(this.http.get<ProveedorRespuesta[]>(this.urlProveedores))).map(aProveedor);
  }

  /** Sensible (aal2). La página recarga la lista después: el orden puede cambiar. */
  async actualizar(codigo: string, cambios: CambiosProveedor): Promise<void> {
    const url = `${this.urlProveedores}/${encodeURIComponent(codigo)}`;
    await solicitar(this.http.patch(url, aCuerpoCambiosProveedor(cambios)));
  }
}
