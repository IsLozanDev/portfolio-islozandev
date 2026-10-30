import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { ArbolPermisosComponent } from '../../components/arbol-permisos/arbol-permisos.component';
import { FormRolComponent } from '../../components/form-rol/form-rol.component';
import type { ArbolPermisos, ProductoDisponible } from '../../models/catalogo-permisos';
import { aErrorAdmin } from '../../models/error-admin';
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import { CatalogoCliente } from '../../services/catalogo.cliente';
import { RolesCliente } from '../../services/roles.cliente';
import { aFormularioRol, crearGrupoRol } from '../../utils/formulario-rol';
import { permisosOrdenados } from '../../utils/seleccion-permisos';

/** Rol propio nuevo: producto, código, nombre y permisos del árbol del producto (U-04, TR-RF-011). */
@Component({
  selector: 'vit-rol-nuevo',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, AccionesFormularioComponent, CargandoComponent, ArbolPermisosComponent, FormRolComponent],
  templateUrl: './rol-nuevo.page.html',
})
export class RolNuevoPage {
  private readonly roles = inject(RolesCliente);
  private readonly catalogo = inject(CatalogoCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_ROLES;
  protected readonly grupo = crearGrupoRol();
  protected readonly productos = signal<ProductoDisponible[] | null>(null);
  protected readonly productoCodigo = signal<string | null>(null);
  protected readonly arbol = signal<ArbolPermisos | null>(null);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly faltanPermisos = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.cargarProductos();
  }

  /** Otro producto, otro catálogo: la selección anterior no aplica. */
  protected async elegirProducto(productoCodigo: string): Promise<void> {
    this.productoCodigo.set(productoCodigo);
    this.seleccionados.set(new Set());
    this.arbol.set(null);
    this.error.set(null);
    try {
      const arbol = await this.catalogo.arbol(productoCodigo);
      if (this.productoCodigo() === productoCodigo) this.arbol.set(arbol);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }

  protected async crear(): Promise<void> {
    const productoCodigo = this.productoCodigo();
    this.faltanPermisos.set(this.seleccionados().size === 0);
    if (this.grupo.invalid || !productoCodigo || this.faltanPermisos()) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    try {
      const rolId = await this.roles.crear(productoCodigo, aFormularioRol(this.grupo), permisosOrdenados(this.seleccionados()));
      this.avisos.toast('exito', MENSAJES_ROLES.rolCreado);
      await this.router.navigate(['..', rolId], { relativeTo: this.ruta });
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.router.navigate(['..'], { relativeTo: this.ruta });
  }

  private async cargarProductos(): Promise<void> {
    try {
      this.productos.set(await this.catalogo.productosDisponibles());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
