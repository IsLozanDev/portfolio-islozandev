/** Comprueba que el ticket de TR-SOP permite el acceso. En R1 solo hay formato; TR-SOP (R3) pone el real. */
export interface VerificadorTicket {
  verificar(datos: { ticket: string; tenantId: string; agenteId: string }): Promise<void>;
}

export const VERIFICADOR_TICKET = Symbol('VERIFICADOR_TICKET');
