export type TipoEventoIngreso = 'LOGIN' | 'LOGIN_FALLIDO';

export interface UsuarioDeIngreso {
  usuarioId: string;
  /** El tenant que elegiría el hook; null si no tiene membresía activa o está bloqueado. */
  tenantId: string | null;
}

export interface EventoIngreso {
  tipo: TipoEventoIngreso;
  tenantId: string | null;
  usuarioId: string | null;
  detalle: Record<string, unknown>;
  ip: string | null;
}

/**
 * LOGIN y LOGIN_FALLIDO sin contexto de tenant: el fallo de contraseña llega sin token y puede no
 * tener tenant. Va por `seg.usuario_para_ingreso` y `seg.registrar_evento_ingreso` (spec 18b).
 */
export interface BitacoraIngreso {
  usuarioPorCorreo(correo: string): Promise<UsuarioDeIngreso | null>;
  registrar(evento: EventoIngreso): Promise<void>;
}
