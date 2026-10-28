import { Component, DestroyRef, inject, input, signal, type OnInit, type WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ALCANCES, type Alcance } from '../../models/asignacion';
import { aErrorAdmin } from '../../models/error-admin';
import { ETIQUETAS_ALCANCE, MENSAJES_ASIGNACION } from '../../models/mensajes-admin';
import type { Ubicacion } from '../../models/ubicacion';
import { OrganizacionCliente } from '../../services/organizacion.cliente';
import type { GrupoAsignacion } from '../../utils/formulario-asignacion';

/** Cuántos niveles de ubicación pide cada alcance: empresa, luego sucursal, luego unidad. */
const NIVELES_DEL_ALCANCE: Readonly<Record<Alcance, number>> = { TENANT: 0, EMPRESA: 1, SUCURSAL: 2, UNIDAD: 3 };

/**
 * Alcance y su ubicación en cascada con las listas del spec 17a. Ofrece todo el tenant: si el actor
 * no cubre el destino, lo rechaza la API (decisión del spec 16a).
 */
@Component({
  selector: 'vit-selector-alcance',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './selector-alcance.component.html',
})
export class SelectorAlcanceComponent implements OnInit {
  private readonly organizacion = inject(OrganizacionCliente);
  private readonly destruccion = inject(DestroyRef);

  readonly grupo = input.required<GrupoAsignacion>();

  protected readonly mensajes = MENSAJES_ASIGNACION;
  protected readonly alcances = ALCANCES.map((alcance) => ({ valor: alcance, etiqueta: ETIQUETAS_ALCANCE[alcance] }));
  protected readonly niveles = signal(0);
  protected readonly empresas = signal<Ubicacion[]>([]);
  protected readonly sucursales = signal<Ubicacion[]>([]);
  protected readonly unidades = signal<Ubicacion[]>([]);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const { alcance, empresaId, sucursalId } = this.grupo().controls;
    this.niveles.set(NIVELES_DEL_ALCANCE[alcance.value]);
    alcance.valueChanges.pipe(takeUntilDestroyed(this.destruccion)).subscribe((valor) => this.niveles.set(NIVELES_DEL_ALCANCE[valor]));
    empresaId.valueChanges.pipe(takeUntilDestroyed(this.destruccion)).subscribe((id) => void this.elegirEmpresa(id));
    sucursalId.valueChanges.pipe(takeUntilDestroyed(this.destruccion)).subscribe((id) => void this.elegirSucursal(id));
    void this.cargar(() => this.organizacion.empresas(), this.empresas);
  }

  private async elegirEmpresa(empresaId: string | null): Promise<void> {
    this.grupo().controls.sucursalId.setValue(null);
    this.sucursales.set([]);
    if (empresaId) await this.cargar(() => this.organizacion.sucursales(empresaId), this.sucursales);
  }

  private async elegirSucursal(sucursalId: string | null): Promise<void> {
    this.grupo().controls.unidadId.setValue(null);
    this.unidades.set([]);
    if (sucursalId) await this.cargar(() => this.organizacion.unidades(sucursalId), this.unidades);
  }

  private async cargar(consulta: () => Promise<Ubicacion[]>, destino: WritableSignal<Ubicacion[]>): Promise<void> {
    try {
      destino.set(await consulta());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
