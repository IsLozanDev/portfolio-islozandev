import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import { filter, map } from 'rxjs';
import { CLAVE_NOMBRE_APP, CLAVE_PREFIJO_MENU } from '../../models/datos-ruta-shell';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { construirArbolMenu, filtrarMenuPorPrefijo } from '../../utils/arbol-menu';
import { MenuLateralComponent } from '../menu-lateral/menu-lateral.component';
import { MenuUsuarioComponent } from '../menu-usuario/menu-usuario.component';
import { SelectorSucursalComponent } from '../selector-sucursal/selector-sucursal.component';

export const ANCHO_ESCRITORIO_PX = 1024;
const CONSULTA_ESCRITORIO = `(min-width: ${ANCHO_ESCRITORIO_PX}px)`;
/** Fuente cargada en `index.html` de la app; `seg.opcion.icono` guarda nombres de Material Symbols. */
const CLASE_FUENTE_ICONOS = 'material-symbols-outlined';

/** Marco de las páginas con sesión y contexto: barra superior, menú lateral y contenido. */
@Component({
  selector: 'vit-layout',
  imports: [RouterOutlet, MatButtonModule, MatIconModule, MatSidenavModule, MatToolbarModule, MenuLateralComponent, MenuUsuarioComponent, SelectorSucursalComponent],
  templateUrl: './layout.component.html',
})
export class LayoutComponent {
  private readonly sesion = inject(SesionService);
  private readonly menuLateral = viewChild.required(MatSidenav);

  private readonly datosRuta = inject(ActivatedRoute).snapshot.data;
  private readonly prefijoMenu: string | undefined = this.datosRuta[CLAVE_PREFIJO_MENU];

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly nombreApp: string = this.datosRuta[CLAVE_NOMBRE_APP] ?? MENSAJES_SHELL.nombreAppPorDefecto;
  protected readonly menu = computed(() => construirArbolMenu(filtrarMenuPorPrefijo(this.sesion.contexto()?.menu ?? [], this.prefijoMenu)));
  protected readonly escritorio = toSignal(
    inject(BreakpointObserver)
      .observe(CONSULTA_ESCRITORIO)
      .pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );

  constructor() {
    // Aquí y no en la app: `MatIconRegistry` en el arranque engorda el bundle inicial, y los iconos solo se pintan dentro del layout.
    inject(MatIconRegistry).setDefaultFontSetClass(CLASE_FUENTE_ICONOS);
    inject(Router)
      .events.pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.cerrarMenuEnMovil());
  }

  private cerrarMenuEnMovil(): void {
    if (this.escritorio()) return;
    void this.menuLateral().close();
  }
}
