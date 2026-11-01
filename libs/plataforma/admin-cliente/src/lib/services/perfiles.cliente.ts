import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import {
  aPerfil,
  aPerfilDetalle,
  aRolDisponible,
  type FormularioPerfil,
  type ListadoPerfilesRespuesta,
  type ListadoRolesDisponiblesRespuesta,
  type Perfil,
  type PerfilCreadoRespuesta,
  type PerfilDetalle,
  type PerfilDetalleRespuesta,
  type RolDisponible,
} from '../models/perfil';
import { solicitar } from '../utils/solicitar';

const RUTA_PERFILES = '/seg/perfiles';

/** Perfiles de puesto del tenant (spec 16c, TR-RF-012). Los errores salen como `ErrorAdmin`. */
@Injectable({ providedIn: 'root' })
export class PerfilesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPerfiles = inject(CONFIG_AUTH).apiUrl + RUTA_PERFILES;

  async listar(): Promise<Perfil[]> {
    const respuesta = await solicitar(this.http.get<ListadoPerfilesRespuesta>(this.urlPerfiles));
    return respuesta.items.map(aPerfil);
  }

  async detalle(perfilId: string): Promise<PerfilDetalle> {
    return aPerfilDetalle(await solicitar(this.http.get<PerfilDetalleRespuesta>(this.urlDe(perfilId))));
  }

  /** Roles activos de PLAT y de los productos contratados, por producto y nombre (TR-CA-035). */
  async rolesDisponibles(): Promise<RolDisponible[]> {
    const respuesta = await solicitar(this.http.get<ListadoRolesDisponiblesRespuesta>(`${this.urlPerfiles}/roles-disponibles`));
    return respuesta.items.map(aRolDisponible);
  }

  async crear(formulario: FormularioPerfil, roles: readonly string[]): Promise<string> {
    const cuerpo = { codigo: formulario.codigo, nombre: formulario.nombre, roles: [...roles] };
    return (await solicitar(this.http.post<PerfilCreadoRespuesta>(this.urlPerfiles, cuerpo))).perfil_id;
  }

  /** Copia y edición en una sola llamada; siempre envía los roles. */
  async copiar(origenId: string, formulario: FormularioPerfil, roles: readonly string[]): Promise<string> {
    const cuerpo = { codigo: formulario.codigo, nombre: formulario.nombre, roles: [...roles] };
    return (await solicitar(this.http.post<PerfilCreadoRespuesta>(`${this.urlDe(origenId)}/copia`, cuerpo))).perfil_id;
  }

  /** Reemplaza el conjunto completo. */
  async cambiarRoles(perfilId: string, roles: readonly string[]): Promise<void> {
    await solicitar(this.http.put(`${this.urlDe(perfilId)}/roles`, { roles: [...roles] }));
  }

  private urlDe(perfilId: string): string {
    return `${this.urlPerfiles}/${encodeURIComponent(perfilId)}`;
  }
}
