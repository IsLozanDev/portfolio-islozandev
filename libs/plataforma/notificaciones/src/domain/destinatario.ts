/** Por persona (su correo principal en TR-PER) o por una dirección directa (p. ej. un propietario invitado). */
export type Destinatario = { personaId: string } | { correo: string };
