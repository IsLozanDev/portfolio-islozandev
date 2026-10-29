import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aResultadoInactivar,
  aRol,
  aRolDetalle,
  type FormularioRol,
  type ListadoRolesRespuesta,
  type ResultadoInactivar,
  type ResultadoInactivarRespuesta,
  type Rol,
  type RolCreadoRespuesta,
  type RolDetalle,
  type RolDetalleRespuesta,
} from '../models/rol';
import { solicitar } from '../utils/solicitar';

const RUTA_ROLES = '/seg/roles';

/** Roles del tenant (spec 16b, TR-RF-011). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class RolesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlRoles = inject(CONFIG_AUTH).apiUrl + RUTA_ROLES;

  async listar(): Promise<Rol[]> {
    const respuesta = await solicitar(this.http.get<ListadoRolesRespuesta>(this.urlRoles));
    return respuesta.items.map(aRol);
  }

  async detalle(rolId: string): Promise<RolDetalle> {
    return aRolDetalle(await solicitar(this.http.get<RolDetalleRespuesta>(this.urlDe(rolId))));
  }

  async crear(productoCodigo: string, formulario: FormularioRol, permisos: readonly string[]): Promise<string> {
    const cuerpo = { producto_codigo: productoCodigo, codigo: formulario.codigo, nombre: formulario.nombre, permisos: [...permisos] };
    return (await solicitar(this.http.post<RolCreadoRespuesta>(this.urlRoles, cuerpo))).rol_id;
  }

  /** TR-CA-031: copia y edición en una sola llamada; siempre envía los permisos. */
  async copiar(origenId: string, formulario: FormularioRol, permisos: readonly string[]): Promise<string> {
    const cuerpo = { codigo: formulario.codigo, nombre: formulario.nombre, permisos: [...permisos] };
    return (await solicitar(this.http.post<RolCreadoRespuesta>(`${this.urlDe(origenId)}/copia`, cuerpo))).rol_id;
  }

  /** Reemplaza el conjunto completo. */
  async cambiarPermisos(rolId: string, permisos: readonly string[]): Promise<void> {
    await solicitar(this.http.put(`${this.urlDe(rolId)}/permisos`, { permisos: [...permisos] }));
  }

  /** TR-CA-033: sin `confirmado` solo informa cuántos usuarios afecta. */
  async inactivar(rolId: string, confirmado: boolean): Promise<ResultadoInactivar> {
    return aResultadoInactivar(await solicitar(this.http.post<ResultadoInactivarRespuesta>(`${this.urlDe(rolId)}/inactivar`, { confirmado })));
  }

  private urlDe(rolId: string): string {
    return `${this.urlRoles}/${encodeURIComponent(rolId)}`;
  }
}
