import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { FormCodigoNombreComponent } from '../../components/form-codigo-nombre/form-codigo-nombre.component';
import { SelectorRolesComponent } from '../../components/selector-roles/selector-roles.component';
import { aErrorAdmin } from '../../models/error-admin';
import { MENSAJES_PERFILES } from '../../models/mensajes-admin';
import type { RolDisponible } from '../../models/perfil';
import { PerfilesCliente } from '../../services/perfiles.cliente';
import { aCodigoNombre, crearGrupoCodigoNombre } from '../../utils/formulario-codigo-nombre';
import { permisosOrdenados } from '../../utils/seleccion-permisos';

/** Perfil propio nuevo: código, nombre y roles de PLAT y de productos contratados (U-04, TR-RF-012, TR-CA-034). */
@Component({
  selector: 'vit-perfil-nuevo',
  imports: [ReactiveFormsModule, AccionesFormularioComponent, CargandoComponent, FormCodigoNombreComponent, SelectorRolesComponent],
  templateUrl: './perfil-nuevo.page.html',
})
export class PerfilNuevoPage {
  private readonly perfiles = inject(PerfilesCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_PERFILES;
  protected readonly grupo = crearGrupoCodigoNombre();
  protected readonly disponibles = signal<RolDisponible[] | null>(null);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly faltanRoles = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.cargar();
  }

  protected async crear(): Promise<void> {
    this.faltanRoles.set(this.seleccionados().size === 0);
    if (this.grupo.invalid || this.faltanRoles()) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    try {
      // `permisosOrdenados` ordena cualquier conjunto de ids; aquí, ids de rol.
      const perfilId = await this.perfiles.crear(aCodigoNombre(this.grupo), permisosOrdenados(this.seleccionados()));
      this.avisos.toast('exito', MENSAJES_PERFILES.perfilCreado);
      await this.router.navigate(['..', perfilId], { relativeTo: this.ruta });
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.router.navigate(['..'], { relativeTo: this.ruta });
  }

  private async cargar(): Promise<void> {
    try {
      this.disponibles.set(await this.perfiles.rolesDisponibles());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
