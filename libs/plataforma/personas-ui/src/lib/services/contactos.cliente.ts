import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { aPersonaDetalle, type PersonaDetalle, type PersonaDetalleRespuesta } from '../models/persona';
import { aCuerpoEdicion, type EdicionContacto, type NuevoContacto } from '../models/solicitudes-persona';
import { solicitar } from '../utils/solicitar';
import { RUTA_PERSONAS } from './personas.cliente';

/** Contactos de una persona (spec 32). Agregar y editar devuelven la persona con su versión nueva. */
@Injectable({ providedIn: 'root' })
export class ContactosCliente {
  private readonly http = inject(HttpClient);
  private readonly urlPersonas = inject(CONFIG_AUTH).apiUrl + RUTA_PERSONAS;

  async agregar(personaId: string, contacto: NuevoContacto): Promise<PersonaDetalle> {
    return aPersonaDetalle(await solicitar(this.http.post<PersonaDetalleRespuesta>(this.urlContactos(personaId), contacto)));
  }

  async editar(personaId: string, contactoId: string, edicion: EdicionContacto): Promise<PersonaDetalle> {
    const peticion = this.http.patch<PersonaDetalleRespuesta>(this.urlContacto(personaId, contactoId), aCuerpoEdicion(edicion));
    return aPersonaDetalle(await solicitar(peticion));
  }

  /** 204: quien llama relee la persona. */
  async eliminar(personaId: string, contactoId: string, version: number): Promise<void> {
    await solicitar(this.http.delete<void>(this.urlContacto(personaId, contactoId), { params: { version } }));
  }

  private urlContactos(personaId: string): string {
    return `${this.urlPersonas}/${encodeURIComponent(personaId)}/contactos`;
  }

  private urlContacto(personaId: string, contactoId: string): string {
    return `${this.urlContactos(personaId)}/${encodeURIComponent(contactoId)}`;
  }
}
