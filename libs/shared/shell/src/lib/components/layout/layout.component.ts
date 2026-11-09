import { BreakpointObserver } from '@angular/cdk/layout';
import { afterNextRender, Component, computed, inject, Injector, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import { filter, map } from 'rxjs';
import { CLAVE_NOMBRE_APP, CLAVE_PREFIJO_MENU } from '../../models/datos-ruta-shell';
import { ANCHO_MENU_OCULTO_PX, ANCHO_MENU_VISIBLE_PX, DURACION_ANIMACION_MENU_MS } from '../../models/medidas-shell';
import { MENSAJES_SHELL, mensajeVolverA } from '../../models/mensajes-shell';
import { PreferenciaMenuService } from '../../services/preferencia-menu.service';
import { VolverAService } from '../../services/volver-a.service';
import { construirArbolMenu, filtrarMenuPorPrefijo } from '../../utils/arbol-menu';
import { BannerSoporteComponent } from '../banner-soporte/banner-soporte.component';
import { MenuLateralComponent } from '../menu-lateral/menu-lateral.component';
import { MenuUsuarioComponent } from '../menu-usuario/menu-usuario.component';
import { RielMenuComponent } from '../riel-menu/riel-menu.component';
import { SelectorSucursalComponent } from '../selector-sucursal/selector-sucursal.component';
import { TareasEnCursoComponent } from '../tareas-en-curso/tareas-en-curso.component';

export const ANCHO_ESCRITORIO_PX = 1024;
const CONSULTA_ESCRITORIO = `(min-width: ${ANCHO_ESCRITORIO_PX}px)`;
/** Fuente cargada en `index.html` de la app; `seg.opcion.icono` guarda nombres de Material Symbols. */
const CLASE_FUENTE_ICONOS = 'material-symbols-outlined';
const TECLA_ATAJO_BUSQUEDA = 'k';
/** En celular el menú se abre encima con el foco en su búsqueda: es también su primer elemento enfocable. */
const FOCO_INICIAL_MENU_MOVIL = 'vit-buscador-menu input';

/** Marco de las páginas con sesión y contexto: barra superior, menú lateral y contenido. */
@Component({
  selector: 'vit-layout',
  imports: [
    RouterOutlet,
    BannerSoporteComponent,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatToolbarModule,
    MenuLateralComponent,
    MenuUsuarioComponent,
    RielMenuComponent,
    SelectorSucursalComponent,
    TareasEnCursoComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
  host: { '(document:keydown)': 'alPulsarAtajo($event)' },
})
export class LayoutComponent {
  private readonly sesion = inject(SesionService);
  private readonly preferenciaMenu = inject(PreferenciaMenuService);
  private readonly injector = inject(Injector);
  private readonly menuLateral = viewChild.required(MatSidenav);
  private readonly menuCompleto = viewChild(MenuLateralComponent);

  private readonly datosRuta = inject(ActivatedRoute).snapshot.data;
  private readonly prefijoMenu: string | undefined = this.datosRuta[CLAVE_PREFIJO_MENU];

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly mensajeVolverA = mensajeVolverA;
  protected readonly volverA = inject(VolverAService).destino;
  protected readonly nombreApp: string = this.datosRuta[CLAVE_NOMBRE_APP] ?? MENSAJES_SHELL.nombreAppPorDefecto;
  protected readonly menu = computed(() => construirArbolMenu(filtrarMenuPorPrefijo(this.sesion.contexto()?.menu ?? [], this.prefijoMenu)));
  protected readonly escritorio = toSignal(
    inject(BreakpointObserver)
      .observe(CONSULTA_ESCRITORIO)
      .pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );
  /** La franja de iconos es solo de escritorio: en celular el menú se abre encima completo. */
  protected readonly menuOculto = computed(() => this.escritorio() && this.preferenciaMenu.colapsado());
  protected readonly focoInicialMenu = computed(() => (this.escritorio() ? false : FOCO_INICIAL_MENU_MOVIL));
  protected readonly medidasMenu = computed(() => ({
    '--mat-sidenav-container-width': `${this.menuOculto() ? ANCHO_MENU_OCULTO_PX : ANCHO_MENU_VISIBLE_PX}px`,
    '--vit-duracion-menu': `${DURACION_ANIMACION_MENU_MS}ms`,
  }));

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

  protected alternarMenuEscritorio(): void {
    this.preferenciaMenu.alternar();
  }

  /** Ctrl K, o Cmd K en macOS: le gana a la acción del navegador solo mientras la página tiene el foco. */
  protected alPulsarAtajo(evento: KeyboardEvent): void {
    if (!esAtajoBusqueda(evento)) return;
    evento.preventDefault();
    this.mostrarBusqueda();
  }

  protected mostrarBusqueda(): void {
    if (!this.escritorio()) {
      void this.menuLateral().open();
      return;
    }
    this.preferenciaMenu.mostrar();
    // Con el menú oculto, el buscador recién existe tras el siguiente render.
    afterNextRender(() => this.menuCompleto()?.enfocarBusqueda(), { injector: this.injector });
  }

  private cerrarMenuEnMovil(): void {
    if (this.escritorio()) return;
    void this.menuLateral().close();
  }
}

function esAtajoBusqueda(evento: KeyboardEvent): boolean {
  const modificador = evento.ctrlKey || evento.metaKey;
  return modificador && !evento.altKey && !evento.shiftKey && evento.key.toLowerCase() === TECLA_ATAJO_BUSQUEDA;
}
