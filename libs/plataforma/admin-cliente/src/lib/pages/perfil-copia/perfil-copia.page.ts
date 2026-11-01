import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { FormCodigoNombreComponent } from '../../components/form-codigo-nombre/form-codigo-nombre.component';
import { SelectorRolesComponent } from '../../components/selector-roles/selector-roles.component';
import { aErrorAdmin } from '../../models/error-admin';
import { MENSAJES_PERFILES } from '../../models/mensajes-admin';
import type { PerfilDetalle, RolDisponible } from '../../models/perfil';
import { PerfilesCliente } from '../../services/perfiles.cliente';
import { aCodigoNombre, crearGrupoCodigoNombre } from '../../utils/formulario-codigo-nombre';
import { rolesQueSiguenDisponibles } from '../../utils/roles-del-perfil';
import { permisosOrdenados } from '../../utils/seleccion-permisos';

const PARAMETRO_PERFIL = 'perfilId';

/** Copia de un perfil con los roles del origen que siguen disponibles; copiar y editar van en una sola llamada. */
@Component({
  selector: 'vit-perfil-copia',
  imports: [ReactiveFormsModule, AccionesFormularioComponent, CargandoComponent, FormCodigoNombreComponent, SelectorRolesComponent],
  templateUrl: './perfil-copia.page.html',
})
export class PerfilCopiaPage {
  private readonly perfiles = inject(PerfilesCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly origenId = this.ruta.snapshot.paramMap.get(PARAMETRO_PERFIL) ?? '';

  protected readonly mensajes = MENSAJES_PERFILES;
  protected readonly grupo = crearGrupoCodigoNombre();
  protected readonly origen = signal<PerfilDetalle | null>(null);
  protected readonly disponibles = signal<RolDisponible[] | null>(null);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly faltanRoles = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.cargar();
  }

  protected async copiar(): Promise<void> {
    this.faltanRoles.set(this.seleccionados().size === 0);
    if (this.grupo.invalid || this.faltanRoles()) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    try {
      const copiaId = await this.perfiles.copiar(this.origenId, aCodigoNombre(this.grupo), permisosOrdenados(this.seleccionados()));
      this.avisos.toast('exito', MENSAJES_PERFILES.perfilCreado);
      await this.router.navigate(['../..', copiaId], { relativeTo: this.ruta });
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
      const [origen, disponibles] = await Promise.all([this.perfiles.detalle(this.origenId), this.perfiles.rolesDisponibles()]);
      this.seleccionados.set(rolesQueSiguenDisponibles(origen.roles, disponibles));
      this.origen.set(origen);
      this.disponibles.set(disponibles);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
