export type TipoUsuario = 'INTERNO' | 'EXTERNO' | 'SOPORTE';
export type Aal = 'aal1' | 'aal2';

/** Elemento del claim `amr` de Supabase; `timestamp` en segundos epoch. */
export interface EntradaAmr {
  method: string;
  timestamp: number;
}

export interface Principal {
  usuarioId: string;
  tenantId: string | null;
  tipo: TipoUsuario;
  aal: Aal;
  sesionId: string;
  amr: EntradaAmr[];
}

export const METODOS_MFA = ['totp', 'phone', 'webauthn'] as const;

const esMfa = (e: EntradaAmr) => (METODOS_MFA as readonly string[]).includes(e.method);

/** Hora del factor MFA más reciente, o null si el token no trae ninguno. */
export function mfaEn(p: Principal): Date | null {
  const ultimo = p.amr.filter(esMfa).reduce<number | null>((max, e) => (max === null || e.timestamp > max ? e.timestamp : max), null);
  return ultimo === null ? null : new Date(ultimo * 1000);
}

/** TR-RN-009: aal2 y un factor MFA con antigüedad <= maxEdadSeg. */
export function mfaVigente(p: Principal, ahora: Date, maxEdadSeg: number): boolean {
  if (p.aal !== 'aal2') return false;
  const en = mfaEn(p);
  return en !== null && ahora.getTime() - en.getTime() <= maxEdadSeg * 1000;
}
