// Identidad autenticada que viaja en cada solicitud. Sin dependencias de framework.
export type TipoUsuario = 'INTERNO' | 'EXTERNO' | 'SOPORTE';
export type NivelAutenticacion = 'aal1' | 'aal2';

export interface Principal {
  readonly usuarioId: string;          // sub del token = auth.users.id = seg.usuario.id
  readonly tenantId: string | null;    // tenant activo (claim del hook)
  readonly tipo: TipoUsuario;
  readonly aal: NivelAutenticacion;    // aal2 = completó MFA en esta sesión
  readonly sesionId: string;
  readonly email: string | null;
}

export function tieneMfa(p: Principal): boolean {
  return p.aal === 'aal2';
}
