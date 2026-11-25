export const PROPIETARIOS_TENANT = Symbol('PropietariosTenant');

export interface PropietarioTenant {
  usuarioId: string;
  correo: string;
}

/** Destinatarios de los avisos de plataforma (spec 44). Corre dentro de la UnitOfWork del llamador. */
export interface PropietariosTenant {
  /** Tenant del contexto. Membresía ACTIVA y asignación vigente de PLAT_PROPIETARIO. Ordenados por correo. */
  listar(): Promise<PropietarioTenant[]>;
}
