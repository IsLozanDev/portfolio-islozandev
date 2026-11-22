/** La clave de datos del tenant, envuelta con la clave maestra de `versionClaveMaestra`. */
export interface ClaveTenantGuardada {
  tenantId: string;
  /** 32 bytes de clave cifrados más la etiqueta GCM. */
  claveCifrada: Uint8Array;
  iv: Uint8Array;
  versionClaveMaestra: number;
  reenvueltaEn: Date | null;
}

/** sec.clave_tenant del tenant del contexto, sobre la transacción activa. */
export interface RepositorioClavesTenant {
  obtener(): Promise<ClaveTenantGuardada | null>;
  /** Si otra transacción la creó antes, devuelve la que ganó: una sola clave por tenant. */
  crearSiNoExiste(clave: ClaveTenantGuardada): Promise<ClaveTenantGuardada>;
  /** Reemplaza la envoltura; la clave de datos y los secretos no cambian. */
  reenvolver(clave: ClaveTenantGuardada): Promise<void>;
}
