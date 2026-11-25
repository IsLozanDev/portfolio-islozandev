import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  denominacionDe,
  DuplicadosCliente,
  formatoDocumento,
  MENSAJES_DUPLICADOS,
  motivosDe,
  PERMISOS_PERSONAS,
  PersonasCliente,
  TONOS_PUNTAJE,
  type ParCandidato,
} from '@vitrina/plataforma/personas-ui';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AccionesFilaDirective, AvisosService, CeldaTablaDirective, EstadoVacioComponent, TablaComponent, type CambioPagina, type ColumnaTabla, type TonoEstado } from '@vitrina/shared/ui';
import { confirmacionDeDescarte, descarteHecho, esDescarteHecho, ESTADO_DESCARTE, type DescarteHecho } from '../../models/descarte-hecho';
import type { Listado } from '../../models/listado';
import { MENSAJES_DUPLICADOS_ADMIN } from '../../models/mensajes-duplicados-admin';
import { mensajeDeFalloDuplicados } from '../../utils/error-duplicados';
import {
  criteriosDeFiltroDuplicados,
  filtroDuplicadosDesdeUrl,
  parametrosDeFiltroDuplicados,
  type FiltroDuplicadosUrl,
} from '../../utils/filtro-url-duplicados';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaDuplicado {
  idA: string;
  idB: string;
  personaA: string;
  documentoA: string;
  personaB: string;
  documentoB: string;
  puntaje: string;
  tonoPuntaje: TonoEstado;
  motivos: string;
}

const MENSAJES = MENSAJES_DUPLICADOS_ADMIN;
const PRIMERA_PAGINA = 1;
const TONO_POR_DEFECTO: TonoEstado = 'info';

const COLUMNAS: ColumnaTabla<FilaDuplicado>[] = [
  { clave: 'personaA', titulo: MENSAJES.columnas.personaA, movil: 'titulo' },
  { clave: 'personaB', titulo: MENSAJES.columnas.personaB, movil: 'detalle' },
  { clave: 'puntaje', titulo: MENSAJES.columnas.puntaje, tono: (fila) => fila.tonoPuntaje, movil: 'estado' },
  { clave: 'motivos', titulo: MENSAJES.columnas.motivos, movil: 'detalle' },
];

/**
 * Pares de personas posiblemente duplicadas del tenant (spec 40, TR-RF-042 paso 1): paginada, con filtro opcional
 * por persona en la URL. Descartar pide aal2 y deja «Deshacer» hasta cambiar de página o salir.
 */
@Component({
  selector: 'vit-duplicados-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, CeldaTablaDirective, EstadoVacioComponent, TablaComponent],
  templateUrl: './duplicados-lista.page.html',
})
export class DuplicadosListaPage {
  private readonly duplicados = inject(DuplicadosCliente);
  private readonly personas = inject(PersonasCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES;
  protected readonly mensajesDuplicados = MENSAJES_DUPLICADOS;
  protected readonly permisos = PERMISOS_PERSONAS;
  protected readonly columnas = COLUMNAS;

  protected readonly filtro = signal<FiltroDuplicadosUrl>(filtroDuplicadosDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly listado = signal<Listado<FilaDuplicado>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly personaFiltrada = signal<string | null>(null);
  protected readonly ultimoDescarte = signal<DescarteHecho | null>(null);
  protected readonly sinPares = computed(() => !this.cargando() && this.error() === null && this.listado().total === 0);
  /** Solo se pinta la respuesta de la última consulta. */
  private consultaActual = 0;

  constructor() {
    // El descarte hecho desde la comparación llega en el estado de la navegación: dura hasta la siguiente.
    let descarteRecibido = descarteDeLaNavegacion(this.router);
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      const anterior = this.filtro().personaId;
      this.filtro.set(filtroDuplicadosDesdeUrl(parametros));
      this.ultimoDescarte.set(descarteRecibido);
      descarteRecibido = null;
      if (this.filtro().personaId !== anterior || this.personaFiltrada() === null) void this.cargarPersonaFiltrada();
      void this.cargar();
    });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ ...this.filtro(), pagina: indice + 1, tamano });
  }

  protected quitarFiltro(): void {
    this.navegar({ ...this.filtro(), personaId: null, pagina: PRIMERA_PAGINA });
  }

  protected async descartar(fila: FilaDuplicado): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    if (!(await this.avisos.confirmar(confirmacionDeDescarte(fila.personaA, fila.personaB)))) return;
    if (!(await this.intentar(() => this.duplicados.descartar(fila.idA, fila.idB)))) return;
    this.ultimoDescarte.set(descarteHecho(fila.idA, fila.idB, fila.personaA, fila.personaB));
    await this.cargar();
  }

  protected async deshacer(): Promise<void> {
    const descarte = this.ultimoDescarte();
    if (!descarte || !(await this.accionSensible.exigirMfa())) return;
    this.ultimoDescarte.set(null);
    await this.intentar(() => this.duplicados.quitarDescarte(descarte.idA, descarte.idB));
    await this.cargar();
  }

  private async intentar(accion: () => Promise<void>): Promise<boolean> {
    try {
      await accion();
      return true;
    } catch (error) {
      await this.avisos.error(MENSAJES.tituloError, mensajeDeFalloDuplicados(error));
      return false;
    }
  }

  private navegar(filtro: FiltroDuplicadosUrl): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: parametrosDeFiltroDuplicados(filtro) });
  }

  /** El nombre del chip; si la persona no se puede leer, el chip dice «Persona filtrada». */
  private async cargarPersonaFiltrada(): Promise<void> {
    const personaId = this.filtro().personaId;
    this.personaFiltrada.set(null);
    if (personaId === null) return;
    try {
      const persona = await this.personas.obtener(personaId);
      if (this.filtro().personaId === personaId) this.personaFiltrada.set(MENSAJES.paresDe(denominacionDe(persona)));
    } catch {
      if (this.filtro().personaId === personaId) this.personaFiltrada.set(MENSAJES.personaFiltrada);
    }
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const pagina = await this.duplicados.listar(criteriosDeFiltroDuplicados(this.filtro()));
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: pagina.items.map(filaDe), total: pagina.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(mensajeDeFalloDuplicados(error));
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function descarteDeLaNavegacion(router: Router): DescarteHecho | null {
  const descarte: unknown = router.currentNavigation()?.extras.state?.[ESTADO_DESCARTE];
  return esDescarteHecho(descarte) ? descarte : null;
}

function filaDe(par: ParCandidato): FilaDuplicado {
  return {
    idA: par.personaA.id,
    idB: par.personaB.id,
    personaA: par.personaA.denominacion,
    documentoA: formatoDocumento(par.personaA.tipoDocumento, par.personaA.numeroDocumento),
    personaB: par.personaB.denominacion,
    documentoB: formatoDocumento(par.personaB.tipoDocumento, par.personaB.numeroDocumento),
    puntaje: String(par.puntaje),
    tonoPuntaje: TONOS_PUNTAJE[par.puntaje] ?? TONO_POR_DEFECTO,
    motivos: motivosDe(par.motivos),
  };
}
