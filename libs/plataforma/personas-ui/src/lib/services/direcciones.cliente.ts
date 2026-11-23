import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aPersonaDetalle, type PersonaDetalle, type PersonaDetalleRespuesta } from '../models/persona';
import { aCuerpoEdicion, type EdicionDireccion, type NuevaDireccion } from '../models/solicitudes-persona';
import { solicitar } from '../utils/solicitar';
import { RUTA_PERSONAS } from './personas.cliente';

/** Direcciones de una persona (spec 32). Agregar y editar devuelven la persona con su versión nueva. */
@Injectable({ providedIn: 'root' })
export class DireccionesCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPersonas = inject(CONFIG_AUTH).apiUrl + RUTA_PERSONAS;

  async agregar(personaId: string, direccion: NuevaDireccion): Promise<PersonaDetalle> {
    return aPersonaDetalle(await solicitar(this.http.post<PersonaDetalleRespuesta>(this.urlDirecciones(personaId), direccion)));
  }

  async editar(personaId: string, direccionId: string, edicion: EdicionDireccion): Promise<PersonaDetalle> {
    const peticion = this.http.patch<PersonaDetalleRespuesta>(this.urlDireccion(personaId, direccionId), aCuerpoEdicion(edicion));
    return aPersonaDetalle(await solicitar(peticion));
  }

  /** 204: quien llama relee la persona. */
  async eliminar(personaId: string, direccionId: string, version: number): Promise<void> {
    await solicitar(this.http.delete<void>(this.urlDireccion(personaId, direccionId), { params: { version } }));
  }

  private urlDirecciones(personaId: string): string {
    return `${this.urlPersonas}/${encodeURIComponent(personaId)}/direcciones`;
  }

  private urlDireccion(personaId: string, direccionId: string): string {
    return `${this.urlDirecciones(personaId)}/${encodeURIComponent(direccionId)}`;
  }
}
