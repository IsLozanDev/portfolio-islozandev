// AAD de AES-GCM: atan cada cifrado a su fila. Un cifrado copiado a otro tenant, otro id, otro tipo u otra
// versión de maestra no pasa la etiqueta.

export function datosAsociadosClave(tenantId: string, versionClaveMaestra: number): string {
  return `sec.clave_tenant|${tenantId}|${versionClaveMaestra}`;
}

export function datosAsociadosSecreto(tenantId: string, secretoId: string, tipo: string): string {
  return `sec.secreto|${tenantId}|${secretoId}|${tipo}`;
}
