import { DOCUMENT, inject, Injectable } from '@angular/core';
import { SesionService } from '@vitrina/shared/auth';
import { destinoConVuelta } from '../utils/destino-con-vuelta';
import { SoporteAgenteCliente } from './soporte-agente.cliente';

/**
 * Entrar al tenant del cliente (spec 18): la API fija el tenant preferido, se renueva el token y se abre
 * `plataforma-admin` con «Volver a» esta página. La sesión se comparte entre apps (spec 17c).
 */
@Injectable({ providedIn: 'root' })
export class EntradaSoporteService {
  private readonly soporte = inject(SoporteAgenteCliente);
  private readonly sesion = inject(SesionService);
  private readonly documento = inject(DOCUMENT);

  async entrar(accesoId: string, urlAdministracion: string): Promise<void> {
    await this.soporte.entrar(accesoId);
    await this.sesion.refrescarSesion();
    this.documento.location.assign(destinoConVuelta(urlAdministracion, this.documento.location.href));
  }
}
