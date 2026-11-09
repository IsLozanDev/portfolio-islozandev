import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AccionesFormularioComponent, mensajeDeValidacion, PanelLateralComponent } from '@vitrina/shared/ui';
import { ALCANCE_GLOBAL, esModoGlobal } from '../../config/datos-ruta-feriados';
import { provideFechaPeru } from '../../config/provide-fecha-peru';
import { aErrorFeriados, type ErrorFeriados } from '../../models/error-feriados';
import type { AlcanceFeriado, CambiosFeriado, FeriadoDelAnio, SucursalFeriado } from '../../models/feriado';
import { ETIQUETAS_ALCANCE_FERIADO, MENSAJES_FERIADOS, MENSAJES_FORMULARIO_FERIADO } from '../../models/mensajes-feriados';
import { FeriadosCliente } from '../../services/feriados.cliente';
import { fechaDesdeIso, isoDesdeFecha } from '../../utils/fecha';

const NOMBRE_MINIMO = 3;
const NOMBRE_MAXIMO = 100;
const ALCANCE_TENANT: AlcanceFeriado = 'TENANT';
const ALCANCE_SUCURSAL: AlcanceFeriado = 'SUCURSAL';
/** Error del control con el mensaje de la API (p. ej. TR-CA-077 en `fecha`). */
const ERROR_API = 'api';
const ERROR_FECHA_ILEGIBLE = 'matDatepickerParse';

export interface DatosFormularioFeriado {
  /** Los alcances que gestiona la app (`data.alcances`). */
  alcances: readonly AlcanceFeriado[];
  sucursales: readonly SucursalFeriado[];
  /** null al crear. */
  feriado: FeriadoDelAnio | null;
}

export type ResultadoFormularioFeriado = 'creado' | 'actualizado' | 'sin-cambios';

/**
 * Contenido del panel lateral de un feriado (TR-RF-029). En la consola el alcance es GLOBAL fijo; en admin,
 * «Toda la empresa» o «Una sucursal». Al editar, el alcance y la sucursal van en solo lectura.
 */
@Component({
  selector: 'vit-formulario-feriado',
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    AccionesFormularioComponent,
    PanelLateralComponent,
  ],
  providers: [provideFechaPeru()],
  templateUrl: './formulario-feriado.component.html',
})
export class FormularioFeriadoComponent {
  private readonly referencia = inject<MatDialogRef<FormularioFeriadoComponent, ResultadoFormularioFeriado>>(MatDialogRef);
  private readonly datos = inject<DatosFormularioFeriado>(MAT_DIALOG_DATA);
  private readonly feriados = inject(FeriadosCliente);

  protected readonly mensajes = MENSAJES_FORMULARIO_FERIADO;
  protected readonly etiquetasAlcance = ETIQUETAS_ALCANCE_FERIADO;
  protected readonly alcanceTenant = ALCANCE_TENANT;
  protected readonly alcanceSucursal = ALCANCE_SUCURSAL;
  protected readonly sucursales = this.datos.sucursales;
  protected readonly feriado = this.datos.feriado;
  protected readonly modoGlobal = esModoGlobal(this.datos.alcances);
  protected readonly titulo = this.feriado ? MENSAJES_FORMULARIO_FERIADO.tituloEdicion : MENSAJES_FORMULARIO_FERIADO.tituloNuevo;
  protected readonly nombreSucursal =
    this.sucursales.find((sucursal) => sucursal.id === this.feriado?.sucursalId)?.nombre ?? MENSAJES_FERIADOS.sinSucursal;

  protected readonly formulario = inject(NonNullableFormBuilder).group({
    alcance: [this.feriado?.alcance ?? (this.modoGlobal ? ALCANCE_GLOBAL : ALCANCE_TENANT)],
    sucursalId: [this.feriado?.sucursalId ?? '', sucursalObligatoriaEnSucursal],
    fecha: [this.feriado ? fechaDesdeIso(this.feriado.fecha) : (null as Date | null), Validators.required],
    nombre: [this.feriado?.nombre ?? '', [Validators.required, Validators.minLength(NOMBRE_MINIMO), Validators.maxLength(NOMBRE_MAXIMO)]],
    recurrenteAnual: [this.feriado?.recurrenteAnual ?? false],
  });
  protected readonly alcanceElegido = toSignal(this.formulario.controls.alcance.valueChanges, { initialValue: this.formulario.controls.alcance.value });
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.formulario.controls.alcance.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.formulario.controls.sucursalId.updateValueAndValidity());
  }

  protected mensajeDeError(errores: ValidationErrors | null): string | null {
    if (typeof errores?.[ERROR_API] === 'string') return errores[ERROR_API];
    if (errores?.[ERROR_FECHA_ILEGIBLE]) return MENSAJES_FORMULARIO_FERIADO.fechaInvalida;
    return mensajeDeValidacion(errores);
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      this.referencia.close(await this.enviar());
    } catch (error) {
      this.mostrarError(aErrorFeriados(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected cerrar(): void {
    this.referencia.close();
  }

  private async enviar(): Promise<ResultadoFormularioFeriado> {
    const cambios = this.cambios();
    if (!this.feriado) {
      const alcance = this.formulario.controls.alcance.value;
      const sucursalId = alcance === ALCANCE_SUCURSAL ? this.formulario.controls.sucursalId.value : null;
      await this.feriados.crear({ ...cambios, alcance, sucursalId });
      return 'creado';
    }
    const cambiado = await this.feriados.actualizar(this.feriado.id, cambios, this.feriado.version);
    return cambiado ? 'actualizado' : 'sin-cambios';
  }

  private cambios(): CambiosFeriado {
    const { fecha, nombre, recurrenteAnual } = this.formulario.getRawValue();
    return { fecha: isoDesdeFecha(fecha as Date), nombre: nombre.trim(), recurrenteAnual };
  }

  /** FERIADO_DUPLICADO y SUCURSAL_NO_ENCONTRADA van a su campo y el panel sigue abierto; lo demás, como alerta. */
  private mostrarError(error: ErrorFeriados): void {
    if (!error.campo) {
      this.error.set(error.message);
      return;
    }
    const control = this.formulario.controls[error.campo];
    control.setErrors({ [ERROR_API]: error.message });
    control.markAsTouched();
  }
}

/** La sucursal es obligatoria solo en un feriado de sucursal. */
function sucursalObligatoriaEnSucursal(control: AbstractControl<string>): ValidationErrors | null {
  const alcance: AlcanceFeriado | undefined = control.parent?.get('alcance')?.value;
  return alcance === ALCANCE_SUCURSAL ? Validators.required(control) : null;
}
