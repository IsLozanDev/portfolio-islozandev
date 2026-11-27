import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, type AbstractControl, type ValidationErrors, type ValidatorFn } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { catchError, debounce, distinctUntilChanged, filter, from, map, of, switchMap, timer } from 'rxjs';
import { VistaPreviaCorreoComponent } from '../../components/vista-previa-correo/vista-previa-correo.component';
import { ContenidoPlantillaInvalidoError, VariableNoPermitidaError, VersionObsoletaPlantillaError, type CampoPlantilla } from '../../models/errores-plantilla';
import { aErrorAdmin } from '../../models/error-admin';
import {
  ERRORES_CAMPO_PLANTILLA,
  ETIQUETAS_CANAL_PLANTILLA,
  etiquetaOrigenConVersion,
  ICONOS_CANAL_PLANTILLA,
  MENSAJES_EDITOR_PLANTILLA,
  MENSAJES_VISTA_PREVIA,
} from '../../models/mensajes-plantillas';
import { PERMISOS_PLANTILLAS } from '../../models/permisos-plantillas';
import { LARGO_MAXIMO_ASUNTO, type CanalPlantilla, type DetallePlantilla, type VariableDeclarada, type VistaPrevia } from '../../models/plantilla';
import { TONOS_ORIGEN_PLANTILLA } from '../../models/tonos-plantilla';
import { PlantillasCliente } from '../../services/plantillas.cliente';
import { formatearFechaCorta } from '../../utils/formato';
import { insertarEnCursor, marcadorDe } from '../../utils/marcadores-plantilla';
import { errorDelAsunto, errorDelCuerpo, variablesPorCampo } from '../../utils/validacion-plantilla';

/** Espera tras dejar de escribir antes de pedir la vista previa (decisión del spec 47). */
const ESPERA_VISTA_PREVIA_MS = 600;
const SIN_ESPERA_MS = 0;
const ESTADO_NO_ENCONTRADO = 404;
const CANALES: readonly CanalPlantilla[] = ['CORREO'];
const ERROR_LOCAL = 'plantilla';
const ERROR_SERVIDOR = 'servidor';

export type VersionVista = 'propia' | 'base';
type EstadoCarga = 'cargando' | 'lista' | 'no-encontrada' | 'error';
type EstadoVistaPrevia = 'generando' | 'lista' | 'error';

interface SolicitudVistaPrevia {
  asunto: string;
  cuerpo: string;
  esBase: boolean;
}

/** Los errores del campo se ven mientras se escribe, sin esperar a que pierda el foco (TR-CA-185). */
class ErrorAlEscribir implements ErrorStateMatcher {
  isErrorState(control: AbstractControl | null): boolean {
    return Boolean(control?.invalid && (control.dirty || control.touched));
  }
}

/**
 * Editor de una plantilla del tenant (TR-RF-074, spec 47): asunto, cuerpo HTML, variables que se insertan en el
 * cursor, validación local de marcadores y vista previa en vivo junto al editor. Sin `gestionar`, solo lectura.
 */
@Component({
  selector: 'vit-plantilla-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CargandoComponent,
    ChipEstadoComponent,
    EstadoVacioComponent,
    VistaPreviaCorreoComponent,
  ],
  templateUrl: './plantilla-editor.page.html',
})
export class PlantillaEditorPage {
  private readonly plantillas = inject(PlantillasCliente);
  private readonly avisos = inject(AvisosService);
  private readonly injector = inject(Injector);
  private readonly parametros = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly mensajes = MENSAJES_EDITOR_PLANTILLA;
  protected readonly mensajesPrevia = MENSAJES_VISTA_PREVIA;
  protected readonly largoMaximoAsunto = LARGO_MAXIMO_ASUNTO;
  protected readonly errorAlEscribir = new ErrorAlEscribir();
  protected readonly editable = inject(SesionService).tiene(PERMISOS_PLANTILLAS.gestionar);

  private readonly codigo = this.parametros.get('codigo') ?? '';
  private readonly canal = CANALES.find((canal) => canal === this.parametros.get('canal'));

  protected readonly estadoCarga = signal<EstadoCarga>('cargando');
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly detalle = signal<DetallePlantilla | null>(null);
  protected readonly variables = computed<readonly VariableDeclarada[]>(() => this.detalle()?.variables ?? []);

  protected readonly asunto = new FormControl('', { nonNullable: true, validators: this.validador((texto) => errorDelAsunto(texto, this.variables())) });
  protected readonly cuerpo = new FormControl('', { nonNullable: true, validators: this.validador((texto) => errorDelCuerpo(texto, this.variables())) });
  private readonly valorAsunto = toSignal(this.asunto.valueChanges, { initialValue: '' });
  private readonly valorCuerpo = toSignal(this.cuerpo.valueChanges, { initialValue: '' });
  private readonly estadoAsunto = toSignal(this.asunto.statusChanges, { initialValue: this.asunto.status });
  private readonly estadoCuerpo = toSignal(this.cuerpo.statusChanges, { initialValue: this.cuerpo.status });

  private readonly campoAsunto = viewChild<ElementRef<HTMLInputElement>>('campoAsunto');
  private readonly campoCuerpo = viewChild<ElementRef<HTMLTextAreaElement>>('campoCuerpo');
  /** Donde insertan los chips de variables: el último campo enfocado. */
  protected readonly campoDestino = signal<CampoPlantilla>('cuerpo');

  protected readonly versionVista = signal<VersionVista>('propia');
  protected readonly vistaPrevia = signal<VistaPrevia | null>(null);
  protected readonly estadoVistaPrevia = signal<EstadoVistaPrevia>('generando');
  protected readonly guardando = signal(false);
  /** Versión guardada cuyo cuerpo devolvió el servidor distinto del enviado (TR-RNF-012). */
  protected readonly versionSaneada = signal<number | null>(null);

  protected readonly largoAsunto = computed(() => this.valorAsunto().length);
  protected readonly conErrorLocal = computed(() => this.estadoAsunto() === 'INVALID' || this.estadoCuerpo() === 'INVALID');
  protected readonly hayCambios = computed(() => {
    const detalle = this.detalle();
    return detalle !== null && (this.valorAsunto() !== detalle.asunto || this.valorCuerpo() !== detalle.cuerpo);
  });
  protected readonly guardarBloqueado = computed(() => !this.hayCambios() || this.conErrorLocal() || this.guardando());
  protected readonly rigeBase = computed(() => this.detalle()?.origen === 'BASE');
  protected readonly vistaAtenuada = computed(() => this.versionVista() === 'propia' && this.conErrorLocal());
  protected readonly encabezado = computed(() => this.encabezadoDe(this.detalle()));

  constructor() {
    this.escucharVistaPrevia();
    void this.cargar();
  }

  protected mensajeDeError(control: FormControl<string>): string | null {
    const errores = control.errors;
    return (errores?.[ERROR_SERVIDOR] as string | undefined) ?? (errores?.[ERROR_LOCAL] as string | undefined) ?? null;
  }

  protected enfocar(campo: CampoPlantilla): void {
    this.campoDestino.set(campo);
  }

  protected insertarVariable(variable: VariableDeclarada): void {
    const destino = this.campoDestino();
    const control = destino === 'asunto' ? this.asunto : this.cuerpo;
    const elemento = (destino === 'asunto' ? this.campoAsunto() : this.campoCuerpo())?.nativeElement;
    const largo = control.value.length;
    const resultado = insertarEnCursor(control.value, elemento?.selectionStart ?? largo, elemento?.selectionEnd ?? largo, marcadorDe(variable.nombre));
    control.setValue(resultado.texto);
    control.markAsDirty();
    afterNextRender(() => ponerCursor(elemento, resultado.cursor), { injector: this.injector });
  }

  protected etiquetaVariable(variable: VariableDeclarada): string {
    return this.mensajes.etiquetaVariable(variable.nombre, variable.tipo, variable.ejemplo ?? this.mensajes.sinEjemplo);
  }

  protected marcador(variable: VariableDeclarada): string {
    return marcadorDe(variable.nombre);
  }

  protected descartar(): void {
    const detalle = this.detalle();
    if (detalle) this.tomarContenido(detalle);
  }

  protected async guardar(): Promise<void> {
    const detalle = this.detalle();
    if (!detalle || !this.canal || this.guardarBloqueado()) return;
    this.guardando.set(true);
    const enviado = { asunto: this.asunto.value, cuerpo: this.cuerpo.value, version: detalle.version };
    try {
      const guardada = await this.plantillas.guardar(this.codigo, this.canal, enviado);
      this.detalle.set(guardada);
      this.tomarContenido(guardada);
      this.versionSaneada.set(guardada.cuerpo === enviado.cuerpo ? null : guardada.version);
      this.avisos.toast('exito', this.mensajes.guardadaComo(guardada.version ?? 0));
    } catch (error) {
      await this.mostrarErrorAlGuardar(error);
    } finally {
      this.guardando.set(false);
    }
  }

  private async mostrarErrorAlGuardar(error: unknown): Promise<void> {
    if (error instanceof VariableNoPermitidaError) return this.marcarVariablesDelServidor(error.variables);
    if (error instanceof ContenidoPlantillaInvalidoError) return this.marcarErrorDelServidor(error.campo, error.message);
    if (error instanceof VersionObsoletaPlantillaError) return this.resolverConflicto();
    this.avisos.toast('error', aErrorAdmin(error).message);
  }

  private marcarVariablesDelServidor(nombres: readonly string[]): void {
    const porCampo = variablesPorCampo(nombres, this.asunto.value, this.cuerpo.value);
    if (porCampo.asunto.length > 0) this.marcarErrorDelServidor('asunto', ERRORES_CAMPO_PLANTILLA.variableNoPermitida(porCampo.asunto));
    if (porCampo.cuerpo.length > 0) this.marcarErrorDelServidor('cuerpo', ERRORES_CAMPO_PLANTILLA.variableNoPermitida(porCampo.cuerpo));
  }

  /** El error se va solo al cambiar el texto: el validador vuelve a correr y reemplaza los errores. */
  private marcarErrorDelServidor(campo: CampoPlantilla, mensaje: string): void {
    const control = campo === 'asunto' ? this.asunto : this.cuerpo;
    control.setErrors({ ...control.errors, [ERROR_SERVIDOR]: mensaje });
    control.markAsTouched();
  }

  /** 409: el texto del editor no se descarta; «Copiar y recargar» lo pone antes en el portapapeles. */
  private async resolverConflicto(): Promise<void> {
    const recargar = await this.avisos.confirmar({
      titulo: this.mensajes.conflictoTitulo,
      texto: this.mensajes.conflictoTexto,
      textoConfirmar: this.mensajes.conflictoRecargar,
      textoCancelar: this.mensajes.conflictoSeguir,
    });
    if (!recargar) return;
    if (!(await copiarAlPortapapeles(this.cuerpo.value))) {
      await this.avisos.advertencia(this.mensajes.noSeCopio, this.mensajes.noSeCopioTexto);
      return;
    }
    this.avisos.toast('info', this.mensajes.copiado);
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    if (!this.canal) {
      this.estadoCarga.set('no-encontrada');
      return;
    }
    try {
      const detalle = await this.plantillas.obtener(this.codigo, this.canal);
      this.detalle.set(detalle);
      this.tomarContenido(detalle);
      this.estadoCarga.set('lista');
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.estado === ESTADO_NO_ENCONTRADO) {
        this.estadoCarga.set('no-encontrada');
        return;
      }
      this.errorCarga.set(errorAdmin.message);
      this.estadoCarga.set('error');
    }
  }

  private tomarContenido(detalle: DetallePlantilla): void {
    this.asunto.setValue(detalle.asunto);
    this.cuerpo.setValue(detalle.cuerpo);
    this.asunto.markAsPristine();
    this.cuerpo.markAsPristine();
  }

  /** Con errores locales no se pide: queda el último render válido, atenuado. La última petición gana. */
  private escucharVistaPrevia(): void {
    const solicitud = computed<SolicitudVistaPrevia | null>(() => {
      const detalle = this.detalle();
      if (!detalle) return null;
      if (this.versionVista() === 'base') return { ...detalle.base, esBase: true };
      if (this.conErrorLocal()) return null;
      return { asunto: this.valorAsunto(), cuerpo: this.valorCuerpo(), esBase: false };
    });
    toObservable(solicitud)
      .pipe(
        filter((pedido): pedido is SolicitudVistaPrevia => pedido !== null),
        distinctUntilChanged((anterior, actual) => anterior.asunto === actual.asunto && anterior.cuerpo === actual.cuerpo),
        debounce((pedido) => timer(pedido.esBase ? SIN_ESPERA_MS : ESPERA_VISTA_PREVIA_MS)),
        switchMap((pedido) => this.pedirVistaPrevia(pedido)),
        takeUntilDestroyed(),
      )
      .subscribe((vista) => {
        this.estadoVistaPrevia.set(vista ? 'lista' : 'error');
        if (vista) this.vistaPrevia.set(vista);
      });
  }

  private pedirVistaPrevia(pedido: SolicitudVistaPrevia) {
    if (!this.canal) return of(null);
    this.estadoVistaPrevia.set('generando');
    return from(this.plantillas.vistaPrevia(this.codigo, this.canal, { asunto: pedido.asunto, cuerpo: pedido.cuerpo })).pipe(
      map((vista): VistaPrevia | null => vista),
      catchError(() => of(null)),
    );
  }

  private validador(error: (texto: string) => string | null): ValidatorFn {
    return (control): ValidationErrors | null => {
      const mensaje = error(String(control.value));
      return mensaje === null ? null : { [ERROR_LOCAL]: mensaje };
    };
  }

  private encabezadoDe(detalle: DetallePlantilla | null) {
    if (!detalle) return null;
    return {
      canal: ETIQUETAS_CANAL_PLANTILLA[detalle.canal],
      iconoCanal: ICONOS_CANAL_PLANTILLA[detalle.canal],
      origen: etiquetaOrigenConVersion(detalle.origen, detalle.version),
      tonoOrigen: TONOS_ORIGEN_PLANTILLA[detalle.origen],
      guardada: detalle.origen === 'BASE' ? this.mensajes.textoBase : this.mensajes.guardada(formatearFechaCorta(new Date(detalle.actualizadoEn))),
    };
  }
}

function ponerCursor(elemento: HTMLInputElement | HTMLTextAreaElement | undefined, cursor: number): void {
  elemento?.focus();
  elemento?.setSelectionRange(cursor, cursor);
}

/** `false` si el navegador no da permiso o no tiene la API (riesgo del spec 47). */
async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
