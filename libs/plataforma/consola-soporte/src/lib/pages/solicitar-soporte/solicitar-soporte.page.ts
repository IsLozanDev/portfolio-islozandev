import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, MensajeValidacionPipe } from '@vitrina/shared/ui';
import { HORAS_SOPORTE, MODOS_SOPORTE, type TenantElegible } from '../../models/acceso-del-agente';
import { aErrorSoporte } from '../../models/error-soporte';
import { ETIQUETAS_MODO_SOPORTE, etiquetaHoras, MENSAJES_SOPORTE } from '../../models/mensajes-soporte';
import { SoporteAgenteCliente } from '../../services/soporte-agente.cliente';
import { TenantsSoporteCliente } from '../../services/tenants-soporte.cliente';
import { aSolicitudDeAcceso, crearGrupoSolicitud, ERROR_TENANT_NO_ELEGIDO, MOTIVO_MAXIMO, nombreDeTenant } from '../../utils/formulario-solicitud';

/** Espera antes de buscar tenants mientras se escribe, como `vit-filtros`. */
export const ESPERA_BUSQUEDA_TENANT_MS = 300;
const LONGITUD_MINIMA_BUSQUEDA = 2;

/** El agente pide entrar al tenant de un cliente (spec 18, TR-RF-020 paso 1; pantalla tipo «Formulario»). */
@Component({
  selector: 'vit-solicitar-soporte',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, RouterLink, AccionesFormularioComponent, MensajeValidacionPipe],
  templateUrl: './solicitar-soporte.page.html',
})
export class SolicitarSoportePage {
  private readonly soporte = inject(SoporteAgenteCliente);
  private readonly tenants = inject(TenantsSoporteCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private esperaBusqueda: ReturnType<typeof setTimeout> | undefined;
  private busquedaActual = 0;

  protected readonly mensajes = MENSAJES_SOPORTE;
  protected readonly modos = MODOS_SOPORTE;
  protected readonly etiquetasModo = ETIQUETAS_MODO_SOPORTE;
  protected readonly horasPosibles = HORAS_SOPORTE;
  protected readonly etiquetaHoras = etiquetaHoras;
  protected readonly nombreDeTenant = nombreDeTenant;
  protected readonly motivoMaximo = MOTIVO_MAXIMO;
  protected readonly errorTenant = ERROR_TENANT_NO_ELEGIDO;
  protected readonly grupo = crearGrupoSolicitud();
  protected readonly opcionesTenant = signal<TenantElegible[]>([]);
  protected readonly sinResultados = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.esperaBusqueda));
  }

  protected escribirTenant(texto: string): void {
    clearTimeout(this.esperaBusqueda);
    const busqueda = texto.trim();
    if (busqueda.length < LONGITUD_MINIMA_BUSQUEDA) {
      this.mostrarTenants([]);
      return;
    }
    this.esperaBusqueda = setTimeout(() => void this.buscarTenants(busqueda), ESPERA_BUSQUEDA_TENANT_MS);
  }

  protected async enviar(): Promise<void> {
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.soporte.solicitar(aSolicitudDeAcceso(this.grupo));
      this.avisos.toast('exito', MENSAJES_SOPORTE.solicitudEnviada);
      await this.router.navigate(['..'], { relativeTo: this.ruta });
    } catch (error) {
      this.error.set(aErrorSoporte(error).message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.router.navigate(['..'], { relativeTo: this.ruta });
  }

  /** Solo se muestran las opciones de la última búsqueda. */
  private async buscarTenants(texto: string): Promise<void> {
    const busqueda = ++this.busquedaActual;
    try {
      const encontrados = await this.tenants.buscar(texto);
      if (busqueda === this.busquedaActual) this.mostrarTenants(encontrados, true);
    } catch {
      if (busqueda === this.busquedaActual) this.mostrarTenants([]);
    }
  }

  private mostrarTenants(tenants: TenantElegible[], buscado = false): void {
    this.opcionesTenant.set(tenants);
    this.sinResultados.set(buscado && tenants.length === 0);
  }
}
