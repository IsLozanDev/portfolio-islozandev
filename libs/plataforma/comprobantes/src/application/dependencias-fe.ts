import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import { ActorRequeridoFeError } from '../domain/errores.js';
import type { EmpresaEmisoraPort } from './ports/empresa-emisora.port.js';
import type { LectorCertificado } from './ports/lector-certificado.js';
import type { ProveedoresFe } from './ports/proveedores-fe.js';
import type { RepositorioEmisores } from './ports/repositorio-emisores.js';

/** Lo que usan los casos de uso del emisor, que corren en la API. */
export interface DependenciasEmisor {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  publicador: EventPublisher;
  auditoria: AuditoriaPort;
  boveda: BovedaSecretos;
  emisores: RepositorioEmisores;
  empresas: EmpresaEmisoraPort;
  proveedores: ProveedoresFe;
  lector: LectorCertificado;
}

export const ENTIDAD_EMISOR = 'emisor_fe';
export const ACCIONES_EMISOR = {
  configurar: 'fe.emisor.configurar',
  cargarCertificado: 'fe.emisor.cargar_certificado',
} as const;

export const TIPOS_SECRETO_FE = {
  credencial: 'fe.credencial',
  certificado: 'fe.certificado',
  claveCertificado: 'fe.clave_certificado',
} as const;

const codificador = new TextEncoder();

export function bytesDe(texto: string): Uint8Array {
  return codificador.encode(texto);
}

/** `creado_por` y `modificado_por` exigen el usuario del token. */
export function actorDe(contexto: TenantContext): string {
  const { actorId } = contexto.current();
  if (!actorId) throw new ActorRequeridoFeError();
  return actorId;
}

/** Guarda el valor la primera vez y rota el mismo secreto después: no quedan secretos huérfanos. */
export async function guardarORotar(boveda: BovedaSecretos, secretoId: string | null, tipo: string, valor: Uint8Array): Promise<string> {
  if (secretoId === null) return boveda.guardar(tipo, valor);
  await boveda.rotar(secretoId, valor);
  return secretoId;
}
