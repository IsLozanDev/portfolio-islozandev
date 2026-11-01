import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { SelectorRolesComponent } from '../../components/selector-roles/selector-roles.component';
import { aErrorAdmin } from '../../models/error-admin';
import { ETIQUETAS_TIPO_PERFIL, MENSAJES_PERFILES } from '../../models/mensajes-admin';
import type { PerfilDetalle, RolDisponible } from '../../models/perfil';
import { PerfilesCliente } from '../../services/perfiles.cliente';
import { rolesQueSiguenDisponibles } from '../../utils/roles-del-perfil';
import { permisosOrdenados } from '../../utils/seleccion-permisos';

const PARAMETRO_PERFIL = 'perfilId';

/**
 * Detalle y editor de roles de un perfil (U-04, TR-RF-012). Un perfil propio se edita; uno
 * predefinido se ve en solo lectura con «Copiar». Los roles que ya no están disponibles se avisan y
 * se quitan al guardar.
 */
@Component({
  selector: 'vit-perfil-detalle',
  imports: [MatButtonModule, RouterLink, CargandoComponent, SelectorRolesComponent],
  templateUrl: './perfil-detalle.page.html',
})
export class PerfilDetallePage {
  private readonly perfiles = inject(PerfilesCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly perfilId = this.ruta.snapshot.paramMap.get(PARAMETRO_PERFIL) ?? '';

  protected readonly mensajes = MENSAJES_PERFILES;
  protected readonly perfil = signal<PerfilDetalle | null>(null);
  protected readonly disponibles = signal<RolDisponible[]>([]);
  protected readonly seleccionados = signal<ReadonlySet<string>>(new Set());
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly editable = computed(() => this.perfil()?.predefinido === false);
  protected readonly rolesNoDisponibles = computed(() => {
    const perfil = this.perfil();
    return perfil ? perfil.roles.length - rolesQueSiguenDisponibles(perfil.roles, this.disponibles()).size : 0;
  });
  protected readonly hayCambios = computed(() => {
    const perfil = this.perfil();
    return perfil !== null && !mismosRoles(perfil.roles, this.seleccionados());
  });
  protected readonly sinRoles = computed(() => this.seleccionados().size === 0);
  protected readonly tipo = computed(() => (this.perfil()?.predefinido ? ETIQUETAS_TIPO_PERFIL.predefinido : ETIQUETAS_TIPO_PERFIL.propio));

  constructor() {
    void this.cargar();
  }

  /** Envía el conjunto completo: es lo que recibe `CambiarRolesPerfil`. */
  protected async guardar(): Promise<void> {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.perfiles.cambiarRoles(this.perfilId, permisosOrdenados(this.seleccionados()));
      this.avisos.toast('exito', MENSAJES_PERFILES.rolesGuardados);
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

  private async cargar(): Promise<void> {
    try {
      const [perfil, disponibles] = await Promise.all([this.perfiles.detalle(this.perfilId), this.perfiles.rolesDisponibles()]);
      this.disponibles.set(disponibles);
      this.seleccionados.set(rolesQueSiguenDisponibles(perfil.roles, disponibles));
      this.perfil.set(perfil);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}

function mismosRoles(roles: readonly string[], seleccionados: ReadonlySet<string>): boolean {
  return roles.length === seleccionados.size && roles.every((rolId) => seleccionados.has(rolId));
}
