import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SesionService } from '@vitrina/shared/auth';
import { AccionesFilaDirective, AvisosService, filasDePagina, PanelLateralService, TablaComponent, type CambioPagina, type ColumnaTabla } from '@vitrina/shared/ui';
import type { EstadoArchivo, VersionesArchivo } from '../../models/archivo';
import { aErrorArchivos } from '../../models/error-archivos';
import type { ArchivoDisponible } from '../../models/estado-carga';
import type { FilaVersion } from '../../models/fila-version';
import { MENSAJES_ARCHIVO_VERSIONES } from '../../models/mensajes-archivo-versiones';
import { PERMISOS_ARCHIVOS } from '../../models/permisos-archivos';
import { TONOS_ESTADO_ARCHIVO } from '../../models/tonos-archivo';
import { ArchivosCliente } from '../../services/archivos.cliente';
import { abrirDescarga } from '../../utils/abrir-descarga';
import { filasDeVersiones } from '../../utils/filas-version';
import { PanelSubirVersionComponent, type DatosPanelSubirVersion } from '../panel-subir-version/panel-subir-version.component';

const TAMANO_PAGINA = 20;
const ICONO_VIGENTE = 'check_circle';

/** Versiones de un archivo (TR-RF-082): lista, subir versión en el panel lateral, marcar vigente y descargar. */
@Component({
  selector: 'vit-archivo-versiones',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TablaComponent, AccionesFilaDirective],
  templateUrl: './archivo-versiones.component.html',
})
export class ArchivoVersionesComponent {
  readonly archivoId = input.required<string>();
  readonly vigenteCambiada = output<number>();

  private readonly archivos = inject(ArchivosCliente);
  private readonly avisos = inject(AvisosService);
  private readonly paneles = inject(PanelLateralService);
  private readonly sesion = inject(SesionService);

  protected readonly mensajes = MENSAJES_ARCHIVO_VERSIONES;
  protected readonly tamanosPagina = [TAMANO_PAGINA];
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pagina = signal<CambioPagina>({ indice: 0, tamano: TAMANO_PAGINA });
  private readonly versiones = signal<VersionesArchivo | null>(null);
  private readonly estado = signal<EstadoArchivo | null>(null);

  protected readonly todas = computed(() => filasDeVersiones(this.versiones()?.versiones ?? []));
  protected readonly filas = computed(() => filasDePagina(this.todas(), this.pagina()));
  protected readonly nombre = computed(() => this.estado()?.nombreOriginal ?? '');
  protected readonly hayEnCurso = computed(() => this.estado()?.versionEnCurso !== undefined);
  protected readonly puedeVersionar = computed(() => this.sesion.tiene(PERMISOS_ARCHIVOS.versionar));
  protected readonly puedeDescargar = computed(() => this.sesion.tiene(PERMISOS_ARCHIVOS.descargar));
  protected readonly columnas: ColumnaTabla<FilaVersion>[] = [
    { clave: 'numero', titulo: MENSAJES_ARCHIVO_VERSIONES.columnaVersion, movil: 'titulo' },
    { clave: 'estado', titulo: MENSAJES_ARCHIVO_VERSIONES.columnaEstado, tono: (fila) => TONOS_ESTADO_ARCHIVO[fila.version.estado], movil: 'estado' },
    { clave: 'vigente', titulo: MENSAJES_ARCHIVO_VERSIONES.columnaVigente, icono: (fila) => (fila.version.vigente ? ICONO_VIGENTE : null), movil: 'detalle' },
    { clave: 'tamano', titulo: MENSAJES_ARCHIVO_VERSIONES.columnaTamano },
    { clave: 'subida', titulo: MENSAJES_ARCHIVO_VERSIONES.columnaSubida },
  ];

  constructor() {
    effect(() => {
      const archivoId = this.archivoId();
      untracked(() => void this.cargar(archivoId));
    });
  }

  protected paginar(cambio: CambioPagina): void {
    this.pagina.set(cambio);
  }

  protected abrirPanel(): void {
    const estado = this.estado();
    if (!estado || this.hayEnCurso()) return;
    const datos: DatosPanelSubirVersion = {
      archivoId: estado.archivoId,
      categoria: estado.categoria,
      nombre: estado.nombreOriginal,
      ...(estado.versionVigente !== undefined && { versionVigente: estado.versionVigente }),
    };
    this.paneles
      .abrir<PanelSubirVersionComponent, DatosPanelSubirVersion, ArchivoDisponible>(PanelSubirVersionComponent, { datos })
      .afterClosed()
      .subscribe(() => void this.cargar(this.archivoId()));
  }

  protected async marcarVigente(fila: FilaVersion): Promise<void> {
    const vigente = this.estado()?.versionVigente;
    const confirmado = await this.avisos.confirmar({
      titulo: this.mensajes.tituloConfirmacion(fila.numero),
      texto: this.mensajes.textoConfirmacion(fila.numero, vigente),
      textoConfirmar: this.mensajes.marcarVigente,
    });
    if (!confirmado) return;
    await this.ejecutar(async () => {
      await this.archivos.marcarVigente(this.archivoId(), fila.numero);
      this.avisos.toast('exito', this.mensajes.vigenteCambiada(fila.numero));
      this.vigenteCambiada.emit(fila.numero);
      await this.cargar(this.archivoId());
    });
  }

  protected async descargar(fila: FilaVersion): Promise<void> {
    await this.ejecutar(async () => abrirDescarga((await this.archivos.urlDescarga(this.archivoId(), fila.numero)).url));
  }

  private async cargar(archivoId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const [versiones, estado] = await Promise.all([this.archivos.versiones(archivoId), this.archivos.estado(archivoId)]);
      if (archivoId !== this.archivoId()) return;
      this.versiones.set(versiones);
      this.estado.set(estado);
    } catch {
      this.error.set(this.mensajes.errorCarga);
    } finally {
      this.cargando.set(false);
    }
  }

  private async ejecutar(accion: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await accion();
    } catch (error) {
      this.error.set(aErrorArchivos(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }
}
