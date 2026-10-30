import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { aErrorAdmin, CODIGO_NO_ENCONTRADO, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import { MENSAJES_ORGANIZACION, MENSAJES_SUCURSALES } from '../../models/mensajes-organizacion';
import type { Sucursal } from '../../models/sucursal';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { SucursalesCliente } from '../../services/sucursales.cliente';
import { PARAMETRO_URL_ORGANIZACION } from '../../utils/filtro-url-organizacion';
import { aDatosSucursal, cargarSucursal, crearGrupoSucursal, faltaEstablecimiento } from '../../utils/formulario-sucursal';
import { mensajeDeErrorOrganizacion } from '../../utils/validadores-organizacion';

const PARAMETRO_SUCURSAL_ID = 'sucursalId';
/** Ruta hermana, relativa a la ruta que monta la lib (`/admin` en plataforma-admin, TR-RNF-122). */
const RUTA_SUCURSALES = 'sucursales';

/** Alta (`/sucursales/nueva?empresa=`) y edición (`/sucursales/:sucursalId/editar`) de una sucursal (U-05, TR-RF-003). */
@Component({
  selector: 'vit-sucursal-formulario',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink, AccionesFormularioComponent, CargandoComponent, EstadoVacioComponent],
  templateUrl: './sucursal-formulario.page.html',
})
export class SucursalFormularioPage {
  private readonly sucursales = inject(SucursalesCliente);
  private readonly recargaContexto = inject(RecargaContextoService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_SUCURSALES;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly rutaSucursales = RUTA_SUCURSALES;
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly mensajeDeError = mensajeDeErrorOrganizacion;
  protected readonly grupo = crearGrupoSucursal();
  /** null en el alta. */
  protected readonly sucursalId = this.ruta.snapshot.paramMap.get(PARAMETRO_SUCURSAL_ID);
  /** En el alta llega por la URL; en la edición, de la sucursal cargada. */
  private readonly empresaIdDelAlta = this.ruta.snapshot.queryParamMap.get(PARAMETRO_URL_ORGANIZACION.empresa);
  protected readonly sucursal = signal<Sucursal | null>(null);
  protected readonly cargando = signal(this.sucursalId !== null);
  protected readonly noExiste = signal(false);
  protected readonly versionObsoleta = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Ayuda bajo el establecimiento: fijo en la principal, o pedirlo a la que dejó de serlo (brecha 5). */
  protected readonly ayudaEstablecimiento = computed(() => {
    const sucursal = this.sucursal();
    if (sucursal?.esPrincipal) return MENSAJES_SUCURSALES.ayudaPrincipal;
    return sucursal && faltaEstablecimiento(sucursal) ? MENSAJES_SUCURSALES.ayudaAsignarEstablecimiento : null;
  });

  constructor() {
    if (this.sucursalId) {
      void this.cargar(this.sucursalId);
      return;
    }
    // El alta necesita la empresa: sin ella, a la lista, que elige una.
    if (!this.empresaIdDelAlta) void this.volverALista(null);
  }

  /** TR-RNF-008: trae lo que guardó el otro usuario y descarta lo editado aquí. */
  protected recargar(): void {
    if (this.sucursalId) void this.cargar(this.sucursalId);
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      await this.enviar();
    } catch (error) {
      this.mostrarError(error);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.volverALista(this.sucursal()?.empresaId ?? this.empresaIdDelAlta);
  }

  private async enviar(): Promise<void> {
    const sucursal = this.sucursal();
    const empresaId = sucursal?.empresaId ?? this.empresaIdDelAlta;
    if (!empresaId) return;
    const datos = aDatosSucursal(this.grupo);
    if (sucursal) await this.sucursales.editar(sucursal.id, sucursal.version, datos);
    else await this.sucursales.registrar(empresaId, datos);

    this.avisos.toast('exito', sucursal ? MENSAJES_SUCURSALES.actualizada : MENSAJES_SUCURSALES.registrada);
    // TR-CA-007: la sucursal nueva o cambiada se ve en el selector del shell sin cerrar sesión.
    await this.recargaContexto.recargar();
    await this.volverALista(empresaId);
  }

  private mostrarError(error: unknown): void {
    const errorAdmin = aErrorAdmin(error);
    if (errorAdmin.codigo === CODIGO_VERSION_OBSOLETA) this.versionObsoleta.set(true);
    else this.error.set(errorAdmin.message);
  }

  private async volverALista(empresaId: string | null): Promise<void> {
    const queryParams = { [PARAMETRO_URL_ORGANIZACION.empresa]: empresaId };
    await this.router.navigate([RUTA_SUCURSALES], { relativeTo: this.rutaMontaje, queryParams });
  }

  private async cargar(sucursalId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      const sucursal = await this.sucursales.consultar(sucursalId);
      cargarSucursal(this.grupo, sucursal);
      this.sucursal.set(sucursal);
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_NO_ENCONTRADO) this.noExiste.set(true);
      else this.error.set(errorAdmin.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
