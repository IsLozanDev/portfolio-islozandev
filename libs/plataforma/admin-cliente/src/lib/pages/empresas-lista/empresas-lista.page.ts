import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink, type Params } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionesFilaDirective, CeldaTablaDirective, TablaComponent, tamanoPaginaParaUrl, type CambioPagina, type ColumnaTabla } from '@vitrina/shared/ui';
import { LogoEmpresaComponent } from '../../components/logo-empresa/logo-empresa.component';
import type { Empresa } from '../../models/empresa';
import { aErrorAdmin } from '../../models/error-admin';
import type { Listado } from '../../models/listado';
import { MENSAJES_EMPRESAS, MENSAJES_ORGANIZACION } from '../../models/mensajes-organizacion';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { EmpresasCliente } from '../../services/empresas.cliente';
import { LogosEmpresaService } from '../../services/logos-empresa.service';
import { PARAMETRO_URL_ORGANIZACION, paginaDesdeUrl, paginaParaUrl, tamanoDesdeUrl } from '../../utils/filtro-url-organizacion';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaEmpresa {
  id: string;
  /** La URL firmada de la miniatura va aparte, en `urlsLogo`: así llega sin volver a crear las filas (spec 17d). */
  logoArchivoId: string | null;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  ubigeo: string;
}

const COLUMNAS: ColumnaTabla<FilaEmpresa>[] = [
  { clave: 'logoArchivoId', titulo: MENSAJES_EMPRESAS.logo, movil: 'inicio' },
  { clave: 'ruc', titulo: MENSAJES_EMPRESAS.ruc, movil: 'detalle' },
  { clave: 'razonSocial', titulo: MENSAJES_EMPRESAS.razonSocial, movil: 'titulo' },
  { clave: 'nombreComercial', titulo: MENSAJES_EMPRESAS.nombreComercial },
  { clave: 'ubigeo', titulo: MENSAJES_EMPRESAS.ubigeo },
];

/** Empresas del tenant con la página en la URL (U-05, TR-RF-002). */
@Component({
  selector: 'vit-empresas-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, CeldaTablaDirective, LogoEmpresaComponent, TablaComponent],
  templateUrl: './empresas-lista.page.html',
})
export class EmpresasListaPage {
  private readonly empresas = inject(EmpresasCliente);
  private readonly logos = inject(LogosEmpresaService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_EMPRESAS;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS;

  protected readonly pagina = signal(paginaDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly tamano = signal(tamanoDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly listado = signal<Listado<FilaEmpresa>>({ items: [], total: 0 });
  /** Por id de archivo; sin entrada (sin logo, sin permiso o aún sin firmar) se ve la inicial. */
  protected readonly urlsLogo = signal<Readonly<Record<string, string>>>({});
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un cambio rápido de página no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.pagina.set(paginaDesdeUrl(parametros));
      this.tamano.set(tamanoDesdeUrl(parametros));
      void this.cargar();
    });
  }

  /** Las sucursales de la empresa: `/admin/sucursales?empresa=<id>`. */
  protected parametrosDeSucursales(empresaId: string): Params {
    return { [PARAMETRO_URL_ORGANIZACION.empresa]: empresaId };
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    const queryParams = { [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(indice + 1), [PARAMETRO_URL_ORGANIZACION.tamano]: tamanoPaginaParaUrl(tamano) };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.empresas.listar({ pagina: this.pagina(), tamano: this.tamano() });
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
      void this.firmarLogos(consulta, listado.items);
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }

  /** La tabla sale enseguida con las iniciales; las miniaturas llegan cuando ARC firma sus URL. */
  private async firmarLogos(consulta: number, empresas: readonly Empresa[]): Promise<void> {
    const firmadas = await Promise.all(
      empresas.map(async (empresa) => [empresa.logoArchivoId, await this.logos.url(empresa.logoArchivoId)] as const),
    );
    if (consulta !== this.consultaActual) return;
    this.urlsLogo.set(Object.fromEntries(firmadas.filter((firmada): firmada is readonly [string, string] => firmada[0] !== null && firmada[1] !== null)));
  }
}

function filaDe(empresa: Empresa): FilaEmpresa {
  return {
    id: empresa.id,
    logoArchivoId: empresa.logoArchivoId,
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial ?? MENSAJES_ORGANIZACION.sinDato,
    ubigeo: empresa.ubigeo ?? MENSAJES_ORGANIZACION.sinDato,
  };
}
