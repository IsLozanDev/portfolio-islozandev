import { inject, Injectable } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { UbigeosService, type ValorUbigeo } from '@vitrina/plataforma/personas-ui';
import { SesionService } from '@vitrina/shared/auth';
import { PERMISOS_CATALOGOS_ADMIN } from '../models/permisos-catalogos-admin';

/** El ubigeo de los formularios de empresa y sucursal (spec 17d): el catálogo si se puede, el código guardado si no. */
@Injectable({ providedIn: 'root' })
export class UbigeosOrganizacionService {
  private readonly ubigeos = inject(UbigeosService);
  private readonly sesion = inject(SesionService);

  sinPermiso(): boolean {
    return !this.sesion.tiene(PERMISOS_CATALOGOS_ADMIN.leer);
  }

  /**
   * El valor para el campo a partir del código guardado: el distrito del catálogo, o el código como texto si el
   * catálogo no está en la lista. Sin permiso o sin catálogo deshabilita el campo, que conserva el código.
   */
  async valorGuardado(control: FormControl<ValorUbigeo>, codigo: string | null): Promise<ValorUbigeo> {
    const catalogoListo = !this.sinPermiso() && (await this.ubigeos.cargar().then(() => true, () => false));
    if (!catalogoListo) {
      control.disable();
      return codigo;
    }
    control.enable();
    return codigo ? (this.ubigeos.porCodigo(codigo) ?? codigo) : null;
  }
}
