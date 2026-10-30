import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { ArbolPermisosComponent } from '../../components/arbol-permisos/arbol-permisos.component';
import type { ArbolPermisos } from '../../models/catalogo-permisos';
import { aErrorAdmin } from '../../models/error-admin';
import { CONFIRMACION_INACTIVAR_ROL, ETIQUETAS_ESTADO_ROL, ETIQUETAS_TIPO_ROL, MENSAJES_ROLES } from '../../models/mensajes-admin';
import type { RolDetalle } from '../../models/rol';
import { CatalogoCliente } from '../../services/catalogo.cliente';
import { RolesCliente } from '../../services/roles.cliente';
import { permisosOrdenados } from '../../utils/seleccion-permisos';

const PARAMETRO_ROL = 'rolId';

/**
 * Detalle y editor de un rol (U-04, TR-RF-011). Solo un rol propio activo se edita; un predefinido
 * se ve en solo lectura con «Copiar» (TR-CA-032) y uno inactivo, sin acciones.
 */
@Component({
  selector: 'vit-rol-detalle',
  imports: [MatButtonModule, RouterLink, CargandoComponent, ArbolPermisosComponent],
  templateUrl: './rol-detalle.page.html',
})
export class RolDetallePage {
  private readonly roles = inject(RolesCliente);
  private readonly catalogo = inject(CatalogoCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly rolId = this.ruta.snapshot.paramMap.get(PARAMETRO_ROL) ?? '';

  protected readonly mensajes = MENSAJES_ROLES;
  protected readonly rol = signal<RolDetalle | null>(null);
  protected readonly arbol = signal<ArbolPermisos | null>(null);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editable = computed(() => {
    const rol = this.rol();
    return rol !== null && !rol.predefinido && rol.activo;
  });
  protected readonly hayCambios = computed(() => {
    const rol = this.rol();
    return rol !== null && !mismosPermisos(rol.permisos, this.seleccionados());
  });
  protected readonly sinPermisos = computed(() => this.seleccionados().size === 0);
  protected readonly tipo = computed(() => (this.rol()?.predefinido ? ETIQUETAS_TIPO_ROL.predefinido : ETIQUETAS_TIPO_ROL.propio));
  protected readonly estado = computed(() => (this.rol()?.activo ? ETIQUETAS_ESTADO_ROL.activo : ETIQUETAS_ESTADO_ROL.inactivo));

  constructor() {
    void this.cargar();
  }

  /** Envía el conjunto completo: es lo que recibe `CambiarPermisosRol`. */
  protected async guardar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.roles.cambiarPermisos(this.rolId, permisosOrdenados(this.seleccionados()));
      this.avisos.toast('exito', MENSAJES_ROLES.permisosGuardados);
      await this.cargar();
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected copiar(): void {
    void this.router.navigate(['copiar'], { relativeTo: this.ruta });
  }

  /** TR-CA-033: primero pregunta a cuántos afecta, confirma con ese número y recién entonces inactiva. */
  protected async inactivar(): Promise<void> {
    const rol = this.rol();
    if (!rol) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      const { afectados } = await this.roles.inactivar(this.rolId, false);
      const texto = afectados > 0 ? CONFIRMACION_INACTIVAR_ROL.afectados(rol.nombre, afectados) : undefined;
      const respuesta = await this.avisos.confirmarDestructiva({ titulo: CONFIRMACION_INACTIVAR_ROL.titulo(rol.nombre), texto, textoConfirmar: MENSAJES_ROLES.inactivar });
      if (!respuesta.confirmado) return;

      await this.roles.inactivar(this.rolId, true);
      this.avisos.toast('exito', MENSAJES_ROLES.rolInactivado);
      await this.cargar();
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** En serie: el árbol es el del producto del rol. */
  private async cargar(): Promise<void> {
    try {
      const rol = await this.roles.detalle(this.rolId);
      if (this.arbol()?.productoCodigo !== rol.productoCodigo) this.arbol.set(await this.catalogo.arbol(rol.productoCodigo));
      this.seleccionados.set(new Set(rol.permisos));
      this.rol.set(rol);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}

function mismosPermisos(permisos: readonly string[], seleccionados: ReadonlySet<string>): boolean {
  return permisos.length === seleccionados.size && permisos.every((permiso) => seleccionados.has(permiso));
}
