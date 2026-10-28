import { Component, inject, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { type StepperSelectionEvent } from '@angular/cdk/stepper';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AccionesFormularioComponent, AvisosService } from '@vitrina/shared/ui';
import { MODALIDADES, PLANES, PRODUCTOS } from '../../models/catalogos';
import { aErrorConsola, type ErrorConsola } from '../../models/error-consola';
import { ETIQUETAS_MODALIDAD, MENSAJES_ALTA } from '../../models/mensajes-consola';
import { AdaptadorFechaPeru } from '../../services/adaptador-fecha-peru.service';
import { BorradorAltaService } from '../../services/borrador-alta.service';
import { CalendarioEnEspanol } from '../../services/calendario-en-espanol.service';
import { TenantsCliente } from '../../services/tenants.cliente';
import { aSolicitudAlta, crearFormularioAlta, ERROR_SERVIDOR, mensajeDeError, type GrupoEmpresa, type GrupoTenant } from '../../utils/formulario-alta';

const LOCALE_PERU = 'es-PE';
const PASO_TENANT = 0;
const PASO_EMPRESA = 1;

/** Errores de la API que se muestran en su campo; el resto va como alerta sobre el asistente. */
const CAMPO_DEL_ERROR: Readonly<Record<string, { paso: number; campo: 'codigo' | 'ruc' }>> = {
  TENANT_DUPLICADO: { paso: PASO_TENANT, campo: 'codigo' },
  RUC_INVALIDO: { paso: PASO_EMPRESA, campo: 'ruc' },
};

/** Asistente de alta de tenant en dos pasos sobre un solo `POST /v1/org/tenants` (TR-RF-001). */
@Component({
  selector: 'vit-tenant-alta',
  imports: [ReactiveFormsModule, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatStepperModule, AccionesFormularioComponent],
  providers: [
    provideNativeDateAdapter(),
    { provide: DateAdapter, useClass: AdaptadorFechaPeru },
    { provide: MAT_DATE_LOCALE, useValue: LOCALE_PERU },
    { provide: MatDatepickerIntl, useClass: CalendarioEnEspanol },
  ],
  templateUrl: './tenant-alta.page.html',
})
export class TenantAltaPage {
  private readonly tenants = inject(TenantsCliente);
  private readonly borrador = inject(BorradorAltaService);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly stepper = viewChild.required(MatStepper);

  protected readonly mensajes = MENSAJES_ALTA;
  protected readonly productos = PRODUCTOS;
  protected readonly planes = PLANES;
  protected readonly modalidades = MODALIDADES;
  protected readonly etiquetasModalidad = ETIQUETAS_MODALIDAD;
  protected readonly mensajeDeError = mensajeDeError;

  protected readonly formulario = crearFormularioAlta();
  protected readonly pasoInicial: number;
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const guardado = this.borrador.leer();
    if (guardado) this.formulario.setValue(guardado.valor);
    this.pasoInicial = guardado?.paso ?? PASO_TENANT;
    void this.accionSensible.exigirMfa();
  }

  protected get tenant(): GrupoTenant['controls'] {
    return this.formulario.controls.tenant.controls;
  }

  protected get empresa(): GrupoEmpresa['controls'] {
    return this.formulario.controls.empresa.controls;
  }

  protected esActivo(): boolean {
    return this.tenant.modalidad.value === 'ACTIVO';
  }

  protected revalidarVigencia(): void {
    this.tenant.vigenteHasta.updateValueAndValidity();
  }

  protected marcarPaso(paso: number): void {
    const grupo = paso === PASO_TENANT ? this.formulario.controls.tenant : this.formulario.controls.empresa;
    grupo.markAllAsTouched();
  }

  protected cambiarPaso(evento: StepperSelectionEvent): void {
    this.guardarBorrador(evento.selectedIndex);
  }

  /** TR-RNF-008: un solo envío a la vez. El borrador se guarda antes, por si la API pide MFA. */
  protected async crear(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    this.guardarBorrador(PASO_EMPRESA);
    try {
      if (!(await this.accionSensible.exigirMfa())) return;
      const creado = await this.tenants.crear(aSolicitudAlta(this.formulario.getRawValue()));
      this.borrador.limpiar();
      await this.avisarResultado(creado.correoEnviado);
      await this.router.navigate(['..', creado.tenantId], { relativeTo: this.ruta });
    } catch (error) {
      this.mostrarError(aErrorConsola(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    this.borrador.limpiar();
    void this.router.navigate(['..'], { relativeTo: this.ruta });
  }

  private guardarBorrador(paso: number): void {
    this.borrador.guardar({ valor: this.formulario.getRawValue(), paso });
  }

  private async avisarResultado(correoEnviado: boolean): Promise<void> {
    if (correoEnviado) {
      this.avisos.toast('exito', MENSAJES_ALTA.creado);
      return;
    }
    await this.avisos.advertencia(MENSAJES_ALTA.creado, MENSAJES_ALTA.correoNoEnviado);
  }

  private mostrarError(error: ErrorConsola): void {
    const destino = CAMPO_DEL_ERROR[error.codigo];
    if (!destino) {
      this.error.set(error.message);
      return;
    }
    const control = destino.campo === 'codigo' ? this.tenant.codigo : this.empresa.ruc;
    control.setErrors({ [ERROR_SERVIDOR]: error.message });
    control.markAsTouched();
    this.stepper().selectedIndex = destino.paso;
  }
}
