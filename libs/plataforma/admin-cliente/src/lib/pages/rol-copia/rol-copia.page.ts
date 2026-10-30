import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { ArbolPermisosComponent } from '../../components/arbol-permisos/arbol-permisos.component';
import { FormRolComponent } from '../../components/form-rol/form-rol.component';
import type { ArbolPermisos } from '../../models/catalogo-permisos';
import { aErrorAdmin } from '../../models/error-admin';
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import type { RolDetalle } from '../../models/rol';
import { CatalogoCliente } from '../../services/catalogo.cliente';
import { RolesCliente } from '../../services/roles.cliente';
import { aFormularioRol, crearGrupoRol } from '../../utils/formulario-rol';
import { permisosOrdenados } from '../../utils/seleccion-permisos';

const PARAMETRO_ROL = 'rolId';

/** TR-CA-031: copia de un rol con el árbol precargado; copiar y editar van en una sola llamada. */
@Component({
  selector: 'vit-rol-copia',
  imports: [ReactiveFormsModule, AccionesFormularioComponent, CargandoComponent, ArbolPermisosComponent, FormRolComponent],
  templateUrl: './rol-copia.page.html',
})
export class RolCopiaPage {
  private readonly roles = inject(RolesCliente);
  private readonly catalogo = inject(CatalogoCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly origenId = this.ruta.snapshot.paramMap.get(PARAMETRO_ROL) ?? '';

  protected readonly mensajes = MENSAJES_ROLES;
  protected readonly grupo = crearGrupoRol();
  protected readonly origen = signal<RolDetalle | null>(null);
  protected readonly arbol = signal<ArbolPermisos | null>(null);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly faltanPermisos = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.cargar();
  }

  protected async copiar(): Promise<void> {
    this.faltanPermisos.set(this.seleccionados().size === 0);
    if (this.grupo.invalid || this.faltanPermisos()) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    try {
      const copiaId = await this.roles.copiar(this.origenId, aFormularioRol(this.grupo), permisosOrdenados(this.seleccionados()));
      this.avisos.toast('exito', MENSAJES_ROLES.rolCreado);
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

  /** En serie: el árbol es el del producto del origen. */
  private async cargar(): Promise<void> {
    try {
      const origen = await this.roles.detalle(this.origenId);
      const arbol = await this.catalogo.arbol(origen.productoCodigo);
      this.seleccionados.set(new Set(origen.permisos));
      this.origen.set(origen);
      this.arbol.set(arbol);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
