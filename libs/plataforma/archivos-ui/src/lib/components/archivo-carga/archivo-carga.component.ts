import { Component, computed, DestroyRef, effect, inject, input, output, signal, untracked, viewChild, type ElementRef, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SesionService, StreamRechazado } from '@vitrina/shared/auth';
import { ChipEstadoComponent } from '@vitrina/shared/ui';
import type { Subscription } from 'rxjs';
import { NUMERO_PRIMERA_VERSION, type AvisoAnalisis, type CargaFirmada, type EstadoArchivo } from '../../models/archivo';
import type { Categoria } from '../../models/categoria';
import { CODIGO_DESCONOCIDO, ErrorArchivos } from '../../models/error-archivos';
import type { ArchivoDisponible, ArchivoRechazado, EtapaCarga, ModoCarga } from '../../models/estado-carga';
import { presentacionFalla } from '../../models/falla-carga';
import { MENSAJES_ARCHIVO_CARGA } from '../../models/mensajes-archivo-carga';
import { PERMISOS_ARCHIVOS } from '../../models/permisos-archivos';
import { ArchivosCliente } from '../../services/archivos.cliente';
import { CategoriasService } from '../../services/categorias.service';
import { EventosAnalisisCliente } from '../../services/eventos-analisis.cliente';
import { SubidaStorageCliente } from '../../services/subida-storage.cliente';
import { abrirDescarga } from '../../utils/abrir-descarga';
import { formatoBytes } from '../../utils/formato-bytes';
import { reglaDeCategoria } from '../../utils/tipos-archivo';
import { validarArchivo } from '../../utils/validar-archivo';

const HTTP_NO_ENCONTRADO = 404;
const SEPARADOR_DETALLE = ' · ';

interface ArchivoMostrado {
  nombre: string;
  bytes?: number;
}

interface CargaEnCurso {
  archivoId: string;
  numero: number;
}

interface CargaPedida extends CargaEnCurso {
  carga: CargaFirmada;
}

/**
 * Un archivo por instancia (spec 36): valida contra su categoría, sube directo a Storage con progreso,
 * confirma y recibe el resultado del análisis por SSE. En modo `version` sube una versión de `archivoId`.
 */
@Component({
  selector: 'vit-archivo-carga',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, ChipEstadoComponent],
  templateUrl: './archivo-carga.component.html',
  styleUrl: './archivo-carga.component.css',
})
export class ArchivoCargaComponent implements OnInit {
  readonly modo = input<ModoCarga>('carga');
  readonly categoria = input<string>('');
  readonly entidadTipo = input<string>('');
  readonly entidadId = input<string>('');
  /** Obligatorio en modo versión; en modo carga, un archivo ya subido que la pantalla vuelve a mostrar. */
  readonly archivoId = input<string | undefined>(undefined);
  readonly etiqueta = input<string | undefined>(undefined);
  readonly deshabilitado = input<boolean>(false);

  readonly disponible = output<ArchivoDisponible>();
  readonly rechazado = output<ArchivoRechazado>();

  private readonly archivos = inject(ArchivosCliente);
  private readonly categorias = inject(CategoriasService);
  private readonly storage = inject(SubidaStorageCliente);
  private readonly eventos = inject(EventosAnalisisCliente);
  private readonly sesion = inject(SesionService);
  private readonly selector = viewChild.required<ElementRef<HTMLInputElement>>('selector');

  protected readonly mensajes = MENSAJES_ARCHIVO_CARGA;
  protected readonly etapa = signal<EtapaCarga>('ESPERA');
  protected readonly encima = signal(false);
  /** Rechazo antes de subir: la zona sigue en espera con el mensaje debajo. */
  protected readonly aviso = signal<string | null>(null);
  protected readonly mostrado = signal<ArchivoMostrado | null>(null);
  protected readonly progreso = signal(0);
  protected readonly mensajeFalla = signal('');
  protected readonly errorDescarga = signal<string | null>(null);
  private readonly reglas = signal<Categoria | null>(null);
  private readonly subidoAhora = signal(false);
  private readonly numeroActual = signal(NUMERO_PRIMERA_VERSION);

  protected readonly enEspera = computed(() => this.etapa() === 'ESPERA');
  protected readonly analizando = computed(() => this.etapa() === 'CONFIRMANDO' || this.etapa() === 'ANALIZANDO');
  protected readonly falla = computed(() => presentacionFalla(this.etapa()));
  protected readonly enModoVersion = computed(() => this.modo() === 'version');
  protected readonly textoZona = computed(() => this.etiqueta() ?? (this.enModoVersion() ? this.mensajes.zonaVersion : this.mensajes.zonaCarga));
  protected readonly etiquetaZona = computed(() => (this.enModoVersion() ? this.mensajes.etiquetaZonaVersion : this.mensajes.etiquetaZonaCarga));
  protected readonly tiposAceptados = computed(() => this.reglas()?.mimesPermitidos.join(',') ?? '');
  protected readonly regla = computed(() => {
    const reglas = this.reglas();
    return reglas ? reglaDeCategoria(reglas) : '';
  });
  protected readonly puedeDescargar = computed(() => this.sesion.tiene(PERMISOS_ARCHIVOS.descargar));
  protected readonly detalle = computed(() => {
    const bytes = this.mostrado()?.bytes;
    const partes = [bytes === undefined ? null : formatoBytes(bytes), this.estadoDelDetalle()];
    return partes.filter((parte) => parte !== null).join(SEPARADOR_DETALLE);
  });

  private archivo: File | null = null;
  private enCurso: CargaEnCurso | null = null;
  private fallaEnSeguimiento = false;
  /** Cada subida, cancelación o destrucción lo cambia: una respuesta de un intento anterior se descarta. */
  private intento = 0;
  private reglasListas: Promise<Categoria | null> = Promise.resolve(null);
  private subida: Subscription | null = null;
  private seguimiento: Subscription | null = null;

  constructor() {
    effect(() => {
      const modo = this.modo();
      const codigo = this.categoria();
      const archivoId = this.archivoId();
      untracked(() => (this.reglasListas = this.cargarReglas(modo, codigo, archivoId)));
    });
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  ngOnInit(): void {
    const archivoId = this.archivoId();
    if (this.modo() === 'carga' && archivoId) void this.retomar(archivoId);
  }

  protected abrirSelector(): void {
    if (this.deshabilitado()) return;
    this.selector().nativeElement.click();
  }

  /** Enter o Espacio sobre la zona; los del botón ya los atiende el botón. */
  protected alPulsarZona(evento: Event): void {
    if (evento.target !== evento.currentTarget || !this.enEspera()) return;
    evento.preventDefault();
    this.abrirSelector();
  }

  protected alElegir(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (archivo) void this.subir(archivo);
  }

  protected alArrastrarEncima(evento: DragEvent): void {
    if (!this.enEspera() || this.deshabilitado()) return;
    evento.preventDefault();
    this.encima.set(true);
  }

  /** `dragleave` también salta al pasar sobre un hijo de la zona: solo cuenta salir de ella. */
  protected alSalirArrastre(evento: DragEvent): void {
    const zona = evento.currentTarget as HTMLElement;
    if (evento.relatedTarget instanceof Node && zona.contains(evento.relatedTarget)) return;
    this.encima.set(false);
  }

  protected alSoltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    const archivo = evento.dataTransfer?.files[0];
    if (archivo && this.enEspera() && !this.deshabilitado()) void this.subir(archivo);
  }

  protected cancelar(): void {
    this.detener();
    this.reiniciar();
  }

  protected atenderFalla(): void {
    if (this.falla()?.accion === 'ELEGIR_OTRO') {
      this.abrirSelector();
      return;
    }
    if (this.fallaEnSeguimiento && this.enCurso) {
      this.seguir(this.intento, this.enCurso);
      return;
    }
    if (this.archivo) void this.subir(this.archivo);
  }

  protected async descargar(): Promise<void> {
    if (!this.enCurso) return;
    this.errorDescarga.set(null);
    try {
      abrirDescarga((await this.archivos.urlDescarga(this.enCurso.archivoId, this.enCurso.numero)).url);
    } catch {
      this.errorDescarga.set(this.mensajes.errorDescarga);
    }
  }

  private async subir(archivo: File): Promise<void> {
    const intento = this.nuevoIntento();
    this.aviso.set(null);
    const reglas = await this.reglasListas;
    if (intento !== this.intento) return;
    const invalido = reglas ? validarArchivo(archivo, reglas)?.mensaje : this.mensajes.sinCategoria;
    if (invalido) {
      this.reiniciar();
      this.aviso.set(invalido);
      return;
    }

    this.archivo = archivo;
    this.mostrado.set({ nombre: archivo.name, bytes: archivo.size });
    this.progreso.set(0);
    this.etapa.set('SUBIENDO');
    try {
      const pedida = await this.pedirCarga(archivo);
      if (intento !== this.intento) return;
      this.enCurso = { archivoId: pedida.archivoId, numero: pedida.numero };
      this.numeroActual.set(pedida.numero);
      this.subida = this.storage.subir(pedida.carga, archivo, archivo.type).subscribe({
        next: (avance) => (avance.tipo === 'progreso' ? this.progreso.set(avance.porcentaje) : void this.confirmar(intento, pedida)),
        error: (error: unknown) => this.fallarSubida(error),
      });
    } catch (error) {
      if (intento === this.intento) this.fallarSubida(error);
    }
  }

  private async pedirCarga(archivo: File): Promise<CargaPedida> {
    const solicitud = { tamano: archivo.size, mime: archivo.type };
    const archivoId = this.archivoId();
    if (this.modo() === 'version' && archivoId) return this.archivos.solicitarVersion(archivoId, solicitud);

    const pedida = await this.archivos.solicitarCarga({
      ...solicitud,
      categoria: this.categoria(),
      nombreOriginal: archivo.name,
      entidadTipo: this.entidadTipo(),
      entidadId: this.entidadId(),
    });
    return { ...pedida, numero: NUMERO_PRIMERA_VERSION };
  }

  private async confirmar(intento: number, carga: CargaEnCurso): Promise<void> {
    this.etapa.set('CONFIRMANDO');
    try {
      if (carga.numero === NUMERO_PRIMERA_VERSION) await this.archivos.confirmarCarga(carga.archivoId);
      else await this.archivos.confirmarVersion(carga.archivoId, carga.numero);
    } catch (error) {
      if (intento === this.intento) this.fallarSubida(error);
      return;
    }
    if (intento !== this.intento) return;
    this.subidoAhora.set(true);
    this.seguir(intento, carga);
  }

  private seguir(intento: number, carga: CargaEnCurso): void {
    this.fallaEnSeguimiento = false;
    this.etapa.set('ANALIZANDO');
    this.seguimiento?.unsubscribe();
    this.seguimiento = this.eventos.abrir(carga.archivoId, carga.numero).subscribe({
      next: (aviso) => {
        if (intento === this.intento && aviso.tipo === 'fin') this.terminar(carga, aviso);
      },
      error: (error: unknown) => {
        if (intento === this.intento) this.fallarSeguimiento(error);
      },
    });
  }

  private terminar(carga: CargaEnCurso, fin: Extract<AvisoAnalisis, { tipo: 'fin' }>): void {
    this.etapa.set(fin.resultado);
    if (fin.resultado === 'DISPONIBLE') {
      this.disponible.emit({ archivoId: carga.archivoId, numero: carga.numero });
      return;
    }
    const mensaje = fin.resultado === 'CUARENTENA' ? this.mensajes.cuarentena : (fin.mensaje ?? this.mensajes.rechazado);
    this.mensajeFalla.set(mensaje);
    this.rechazado.emit({ archivoId: carga.archivoId, numero: carga.numero, resultado: fin.resultado, mensaje });
  }

  /** Un archivo ya subido que la pantalla vuelve a mostrar: un GET; si sigue en análisis, el SSE. */
  private async retomar(archivoId: string): Promise<void> {
    const intento = this.intento;
    let estado: EstadoArchivo;
    try {
      estado = await this.archivos.estado(archivoId);
    } catch {
      return;
    }
    if (intento !== this.intento || estado.estado === 'PENDIENTE_CARGA') return;

    this.enCurso = { archivoId, numero: estado.versionVigente ?? NUMERO_PRIMERA_VERSION };
    this.mostrado.set({ nombre: estado.nombreOriginal, ...(estado.bytes !== undefined && { bytes: estado.bytes }) });
    if (estado.estado === 'EN_ANALISIS') {
      this.seguir(intento, this.enCurso);
      return;
    }
    this.etapa.set(estado.estado);
    if (estado.estado === 'CUARENTENA') this.mensajeFalla.set(this.mensajes.cuarentena);
    if (estado.estado === 'RECHAZADO') this.mensajeFalla.set(this.mensajes.rechazado);
  }

  private async cargarReglas(modo: ModoCarga, codigo: string, archivoId: string | undefined): Promise<Categoria | null> {
    try {
      const codigoReal = !codigo && modo === 'version' && archivoId ? (await this.archivos.estado(archivoId)).categoria : codigo;
      const reglas = codigoReal ? ((await this.categorias.buscar(codigoReal)) ?? null) : null;
      this.reglas.set(reglas);
      return reglas;
    } catch {
      this.reglas.set(null);
      return null;
    }
  }

  private estadoDelDetalle(): string | null {
    switch (this.etapa()) {
      case 'SUBIENDO':
        return this.mensajes.subiendo(this.progreso());
      case 'CONFIRMANDO':
        return this.mensajes.confirmando;
      case 'ANALIZANDO':
        return this.mensajes.analizando;
      case 'DISPONIBLE':
        if (this.enModoVersion()) return this.mensajes.versionVigente(this.numeroActual());
        return this.subidoAhora() ? this.mensajes.subidoAhora : null;
      default:
        return null;
    }
  }

  private fallarSubida(error: unknown): void {
    this.detener();
    this.fallaEnSeguimiento = false;
    const conMensajeDeLaApi = error instanceof ErrorArchivos && error.codigo !== CODIGO_DESCONOCIDO;
    this.mensajeFalla.set(conMensajeDeLaApi ? error.message : this.mensajes.errorSubida);
    this.etapa.set('ERROR');
  }

  /** 404: lo subió otro usuario; se muestra «En análisis» sin seguimiento. Un corte deja reintentar el SSE. */
  private fallarSeguimiento(error: unknown): void {
    if (error instanceof StreamRechazado && error.estado === HTTP_NO_ENCONTRADO) return;
    this.fallaEnSeguimiento = true;
    this.mensajeFalla.set(this.mensajes.corteSeguimiento);
    this.etapa.set('ERROR');
  }

  private nuevoIntento(): number {
    this.detener();
    return this.intento;
  }

  private detener(): void {
    this.intento++;
    this.subida?.unsubscribe();
    this.seguimiento?.unsubscribe();
    this.subida = null;
    this.seguimiento = null;
  }

  private reiniciar(): void {
    this.etapa.set('ESPERA');
    this.mostrado.set(null);
    this.progreso.set(0);
    this.enCurso = null;
  }
}
