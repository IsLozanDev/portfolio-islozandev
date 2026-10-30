import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink, type Params } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionesFilaDirective, TablaComponent, type CambioPagina, type ColumnaTabla } from '@vitrina/shared/ui';
import { map } from 'rxjs';
import type { Empresa } from '../../models/empresa';
import { aErrorAdmin } from '../../models/error-admin';
import type { Listado } from '../../models/listado';
import { MENSAJES_EMPRESAS, MENSAJES_ORGANIZACION } from '../../models/mensajes-organizacion';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { EmpresasCliente } from '../../services/empresas.cliente';
import { PARAMETRO_URL_ORGANIZACION, paginaDesdeUrl, paginaParaUrl, TAMANO_PAGINA_ORGANIZACION } from '../../utils/filtro-url-organizacion';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaEmpresa {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  ubigeo: string;
}

const COLUMNAS: ColumnaTabla<FilaEmpresa>[] = [
  { clave: 'ruc', titulo: MENSAJES_EMPRESAS.ruc },
  { clave: 'razonSocial', titulo: MENSAJES_EMPRESAS.razonSocial },
  { clave: 'nombreComercial', titulo: MENSAJES_EMPRESAS.nombreComercial },
  { clave: 'ubigeo', titulo: MENSAJES_EMPRESAS.ubigeo },
];

/** Empresas del tenant con la página en la URL (U-05, TR-RF-002). */
@Component({
  selector: 'vit-empresas-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, TablaComponent],
  templateUrl: './empresas-lista.page.html',
})
export class EmpresasListaPage {
  private readonly empresas = inject(EmpresasCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_EMPRESAS;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_PAGINA_ORGANIZACION];

  protected readonly pagina = signal(paginaDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly listado = signal<Listado<FilaEmpresa>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un cambio rápido de página no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(map(paginaDesdeUrl), takeUntilDestroyed()).subscribe((pagina) => {
      this.pagina.set(pagina);
      void this.cargar();
    });
  }

  /** Las sucursales de la empresa: `/admin/sucursales?empresa=<id>`. */
  protected parametrosDeSucursales(empresaId: string): Params {
    return { [PARAMETRO_URL_ORGANIZACION.empresa]: empresaId };
  }

  protected paginar({ indice }: CambioPagina): void {
    const queryParams = { [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(indice + 1) };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.empresas.listar({ pagina: this.pagina(), tamano: TAMANO_PAGINA_ORGANIZACION });
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(empresa: Empresa): FilaEmpresa {
  return {
    id: empresa.id,
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial ?? MENSAJES_ORGANIZACION.sinDato,
    ubigeo: empresa.ubigeo ?? MENSAJES_ORGANIZACION.sinDato,
  };
}
