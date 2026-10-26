import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import { filter, map } from 'rxjs';
import { CLAVE_NOMBRE_APP } from '../../models/datos-ruta-shell';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { construirArbolMenu } from '../../utils/arbol-menu';
import { MenuLateralComponent } from '../menu-lateral/menu-lateral.component';
import { MenuUsuarioComponent } from '../menu-usuario/menu-usuario.component';

export const ANCHO_ESCRITORIO_PX = 1024;
const CONSULTA_ESCRITORIO = `(min-width: ${ANCHO_ESCRITORIO_PX}px)`;

/** Marco de las páginas con sesión y contexto: barra superior, menú lateral y contenido. */
@Component({
  selector: 'vit-layout',
  imports: [RouterOutlet, MatButtonModule, MatIconModule, MatSidenavModule, MatToolbarModule, MenuLateralComponent, MenuUsuarioComponent],
  templateUrl: './layout.component.html',
})
export class LayoutComponent {
  private readonly sesion = inject(SesionService);
  private readonly menuLateral = viewChild.required(MatSidenav);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly nombreApp: string = inject(ActivatedRoute).snapshot.data[CLAVE_NOMBRE_APP] ?? MENSAJES_SHELL.nombreAppPorDefecto;
  protected readonly menu = computed(() => construirArbolMenu(this.sesion.contexto()?.menu ?? []));
  protected readonly escritorio = toSignal(
    inject(BreakpointObserver)
      .observe(CONSULTA_ESCRITORIO)
      .pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );

  constructor() {
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
