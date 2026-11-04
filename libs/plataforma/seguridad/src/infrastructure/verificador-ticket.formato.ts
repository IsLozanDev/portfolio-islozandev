import type { VerificadorTicket } from '../application/ports/verificador-ticket.port.js';

/**
 * R1: TR-SOP no existe. El formato SOP-###### ya lo garantiza el dominio, así que no comprueba nada más.
 * En R3 se reemplaza por uno que exige ticket abierto y asignado al agente (spec 18).
 */
export class VerificadorTicketPorFormato implements VerificadorTicket {
  async verificar(): Promise<void> {
    return;
  }
}
