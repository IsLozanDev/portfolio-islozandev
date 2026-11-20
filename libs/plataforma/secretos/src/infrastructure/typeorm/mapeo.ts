import type { ClaveTenantGuardada } from '../../application/ports/repositorio-claves-tenant.js';
import type { SecretoGuardado } from '../../application/ports/repositorio-secretos.js';
import type { FilaClaveTenant, FilaSecreto } from './entidades.js';

type FilaClaveNueva = Omit<FilaClaveTenant, 'creadoEn'>;
type FilaSecretoNueva = Omit<FilaSecreto, 'creadoEn'>;
export type CambiosRotacion = Pick<FilaSecreto, 'cifrado' | 'iv' | 'rotadoPor' | 'rotadoEn'>;
export type CambiosEnvoltura = Pick<FilaClaveTenant, 'claveCifrada' | 'iv' | 'versionClaveMaestra' | 'reenvueltaEn'>;

// El driver de pg solo escribe bytea desde un Buffer.
const comoBuffer = (bytes: Uint8Array): Buffer => Buffer.from(bytes);

export function filaDesdeClave(clave: ClaveTenantGuardada): FilaClaveNueva {
  return { tenantId: clave.tenantId, ...cambiosDeEnvoltura(clave) };
}

export function cambiosDeEnvoltura(clave: ClaveTenantGuardada): CambiosEnvoltura {
  return {
    claveCifrada: comoBuffer(clave.claveCifrada),
    iv: comoBuffer(clave.iv),
    versionClaveMaestra: clave.versionClaveMaestra,
    reenvueltaEn: clave.reenvueltaEn,
  };
}

export function claveDesdeFila(fila: FilaClaveTenant): ClaveTenantGuardada {
  return {
    tenantId: fila.tenantId,
    claveCifrada: fila.claveCifrada,
    iv: fila.iv,
    versionClaveMaestra: fila.versionClaveMaestra,
    reenvueltaEn: fila.reenvueltaEn,
  };
}

export function filaDesdeSecreto(secreto: SecretoGuardado): FilaSecretoNueva {
  return {
    id: secreto.id,
    tenantId: secreto.tenantId,
    tipo: secreto.tipo,
    version: secreto.version,
    creadoPor: secreto.creadoPor,
    ...cambiosDeRotacion(secreto),
  };
}

export function cambiosDeRotacion(secreto: SecretoGuardado): CambiosRotacion {
  return { cifrado: comoBuffer(secreto.cifrado), iv: comoBuffer(secreto.iv), rotadoPor: secreto.rotadoPor, rotadoEn: secreto.rotadoEn };
}

export function secretoDesdeFila(fila: FilaSecreto): SecretoGuardado {
  return {
    id: fila.id,
    tenantId: fila.tenantId,
    tipo: fila.tipo,
    cifrado: fila.cifrado,
    iv: fila.iv,
    version: fila.version,
    creadoPor: fila.creadoPor,
    rotadoPor: fila.rotadoPor,
    rotadoEn: fila.rotadoEn,
  };
}
