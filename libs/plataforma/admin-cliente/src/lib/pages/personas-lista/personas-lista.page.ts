import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ETIQUETAS_COINCIDENCIA,
  ETIQUETAS_ROL,
  ETIQUETAS_TIPO_DOCUMENTO,
  ETIQUETAS_TIPO_PERSONA,
  formatoCelular,
  inicialesDeTexto,
  mensajeDeError,
  ErrorPersonas,
  PanelNuevaPersonaComponent,
  PERMISOS_PERSONAS,
  PersonaBuscadorComponent,
  PersonasCliente,
  PRODUCTOS,
  ROLES_PERSONA,
  TIPOS_PERSONA,
  TONO_ROL,
  TONOS_COINCIDENCIA,
  type DatosPanelNuevaPersona,
  type PersonaListada,
  type ProductoCodigo,
  type ResultadoNuevaPersona,
  type RolPersona,
  type TipoPersona,
} from '@vitrina/plataforma/personas-ui';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionesFilaDirective, AvisosService, CeldaTablaDirective, ChipEstadoComponent, PanelLateralService, TablaComponent, type CambioPagina, type ColumnaTabla, type TonoEstado } from '@vitrina/shared/ui';
import { firstValueFrom } from 'rxjs';
import type { Listado } from '../../models/listado';
import { MENSAJES_PERSONAS_ADMIN } from '../../models/mensajes-personas-admin';
import { criteriosDeFiltroPersonas, filtroPersonasDesdeUrl, parametrosDeFiltroPersonas, type FiltroPersonasUrl } from '../../utils/filtro-url-personas';

/** Lo que muestra cada celda, ya como texto; los roles y la coincidencia van como chips. */
export interface FilaPersona {
  id: string;
  persona: string;
  iniciales: string;
  documento: string;
  celular: string;
  roles: string;
  listaRoles: string[];
  coincidencia: string;
  tonoCoincidencia: TonoEstado;
}

const MENSAJES = MENSAJES_PERSONAS_ADMIN;

const COLUMNAS: ColumnaTabla<FilaPersona>[] = [
  { clave: 'persona', titulo: MENSAJES.columnas.persona, movil: 'titulo' },
  { clave: 'documento', titulo: MENSAJES.columnas.documento, movil: 'detalle' },
  { clave: 'celular', titulo: MENSAJES.columnas.celular, movil: 'detalle' },
  { clave: 'roles', titulo: MENSAJES.columnas.roles },
];
const COLUMNA_COINCIDENCIA: ColumnaTabla<FilaPersona> = { clave: 'coincidencia', titulo: MENSAJES.columnas.coincidencia, tono: (fila) => fila.tonoCoincidencia };

/**
 * Lista de personas del tenant (spec 38): búsqueda por nombre, documento, celular o correo, filtros de tipo,
 * producto y rol, todo en la URL. «Nueva persona» abre el panel de buscar y registrar; al cerrarlo, la ficha.
 */
@Component({
  selector: 'vit-personas-lista',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    RouterLink,
    SiPermisoDirective,
    AccionesFilaDirective,
    CeldaTablaDirective,
    ChipEstadoComponent,
    TablaComponent,
    PersonaBuscadorComponent,
  ],
  templateUrl: './personas-lista.page.html',
})
export class PersonasListaPage {
  private readonly personas = inject(PersonasCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES;
  protected readonly permisos = PERMISOS_PERSONAS;
  protected readonly tonoRol = TONO_ROL;
  protected readonly tiposPersona = TIPOS_PERSONA.map((codigo) => ({ codigo, texto: ETIQUETAS_TIPO_PERSONA[codigo] }));
  protected readonly productos = PRODUCTOS;
  protected readonly roles = ROLES_PERSONA.map((codigo) => ({ codigo, texto: ETIQUETAS_ROL[codigo] }));

  protected readonly filtro = signal<FiltroPersonasUrl>(filtroPersonasDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly columnas = signal<ColumnaTabla<FilaPersona>[]>(COLUMNAS);
  protected readonly listado = signal<Listado<FilaPersona>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroPersonasDesdeUrl(parametros));
      void this.cargar();
    });
  }

  protected buscar(q: string): void {
    if (q === this.filtro().q) return;
    this.navegar({ ...this.filtro(), q, pagina: 1 });
  }

  protected elegirTipo(tipoPersona: TipoPersona | null): void {
    this.navegar({ ...this.filtro(), tipoPersona, pagina: 1 });
  }

  protected elegirProducto(producto: ProductoCodigo | null): void {
    this.navegar({ ...this.filtro(), producto, pagina: 1 });
  }

  protected elegirRol(rol: RolPersona | null): void {
    this.navegar({ ...this.filtro(), rol, pagina: 1 });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  protected async nuevaPersona(): Promise<void> {
    const panel = this.paneles.abrir<PanelNuevaPersonaComponent, DatosPanelNuevaPersona, ResultadoNuevaPersona>(PanelNuevaPersonaComponent, {
      datos: { etiquetaUsar: MENSAJES.abrirFicha },
    });
    const resultado = await firstValueFrom(panel.afterClosed());
    if (!resultado) return;
    if (resultado.registrada) this.avisos.toast('exito', MENSAJES.registrada);
    void this.router.navigate([resultado.personaId], { relativeTo: this.ruta });
  }

  private navegar(filtro: FiltroPersonasUrl): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosDeFiltroPersonas(filtro) });
  }

  private async cargar(): Promise<void> {
    const filtro = this.filtro();
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    this.columnas.set(filtro.q ? [...COLUMNAS, COLUMNA_COINCIDENCIA] : COLUMNAS);
    try {
      const listado = await this.personas.listar(criteriosDeFiltroPersonas(filtro));
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(error instanceof ErrorPersonas ? mensajeDeError(error) : MENSAJES.errorCarga);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(persona: PersonaListada): FilaPersona {
  const listaRoles = persona.roles.map(({ productoCodigo, rol }) => `${productoCodigo} · ${ETIQUETAS_ROL[rol]}`);
  return {
    id: persona.id,
    persona: persona.denominacion,
    iniciales: inicialesDeTexto(persona.denominacion),
    documento: `${ETIQUETAS_TIPO_DOCUMENTO[persona.tipoDocumento]} ${persona.numeroDocumento}`,
    celular: persona.celularPrincipal ? formatoCelular(persona.celularPrincipal) : MENSAJES.sinCelular,
    roles: listaRoles.join(', '),
    listaRoles,
    coincidencia: persona.coincidencia ? ETIQUETAS_COINCIDENCIA[persona.coincidencia] : '',
    tonoCoincidencia: persona.coincidencia ? TONOS_COINCIDENCIA[persona.coincidencia] : 'neutro',
  };
}
