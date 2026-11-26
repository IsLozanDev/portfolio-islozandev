import { Component, computed, effect, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { MensajeValidacionPipe } from '@vitrina/shared/ui';
import { ETIQUETAS_REGIMEN_IGV, REGIMENES_IGV, type CargaConfigurarEmisor, type Emisor } from '../../models/emisor';
import { AYUDA_CREDENCIAL_CONFIGURADA, MENSAJES_EMISOR } from '../../models/mensajes-emisor';
import { PERMISOS_FE_UI } from '../../models/permisos-fe';
import type { ProveedorFe } from '../../models/proveedor-fe';
import { aCargaConfigurar, cargarEmisor, crearGrupoProveedor, exigirUrlSegun } from '../../utils/formulario-emisor';

/** Tarjeta 1: proveedor, credencial, régimen de IGV y leyenda. La clave nunca se rellena. */
@Component({
  selector: 'vit-tarjeta-proveedor',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule, MensajeValidacionPipe, SiPermisoDirective],
  templateUrl: './tarjeta-proveedor.component.html',
})
export class TarjetaProveedorComponent {
  readonly emisor = input.required<Emisor | null>();
  readonly proveedores = input.required<readonly ProveedorFe[]>();
  readonly soloLectura = input<boolean>(false);
  readonly guardando = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly guardar = output<CargaConfigurarEmisor>();

  protected readonly mensajes = MENSAJES_EMISOR.proveedor;
  protected readonly permisos = PERMISOS_FE_UI;
  protected readonly ayudaClaveConfigurada = AYUDA_CREDENCIAL_CONFIGURADA;
  protected readonly regimenes = REGIMENES_IGV.map((codigo) => ({ codigo, texto: ETIQUETAS_REGIMEN_IGV[codigo] }));
  protected readonly grupo = crearGrupoProveedor();

  /** `reset` también emite: sigue al del emisor y al que elija el usuario. */
  private readonly codigoElegido = toSignal(this.grupo.controls.proveedor.valueChanges, { initialValue: '' });
  protected readonly proveedorElegido = computed(() => this.proveedores().find((proveedor) => proveedor.codigo === this.codigoElegido()) ?? null);
  protected readonly esSunat = computed(() => this.proveedorElegido()?.esSunat ?? false);
  protected readonly pideUrl = computed(() => this.proveedorElegido()?.pideUrl ?? false);
  protected readonly avisaRepetirPrueba = computed(() => this.emisor()?.estado === 'VERIFICADO');
  protected readonly enProduccion = computed(() => this.emisor()?.estado === 'PRODUCCION');
  protected readonly tieneCredencial = computed(() => this.emisor()?.tieneCredencial ?? false);

  constructor() {
    // Cada emisor nuevo (al cargar, guardar o recargar tras un 409) vuelve a llenar el formulario.
    effect(() => this.descartar(this.emisor()));
    effect(() => exigirUrlSegun(this.grupo, this.proveedorElegido()));
  }

  protected enviar(): void {
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }
    this.guardar.emit(aCargaConfigurar(this.grupo, this.proveedorElegido(), this.emisor()));
  }

  protected descartar(emisor = this.emisor()): void {
    cargarEmisor(this.grupo, emisor);
    if (this.soloLectura()) this.grupo.disable();
  }
}
