import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import { ActorRequeridoFeError, ProveedorFeInvalidoError, UrlProveedorNoPermitidaError } from '../domain/errores.js';
import { PROVEEDORES_CON_ADAPTADOR } from '../domain/proveedores-fe.js';
import { exigirUrlPermitida } from '../domain/url-proveedor.js';
import type { EmpresaEmisoraPort } from './ports/empresa-emisora.port.js';
import type { LectorCertificado } from './ports/lector-certificado.js';
import type { ProveedorFe, ProveedoresFe } from './ports/proveedores-fe.js';
import type { RepositorioEmisores } from './ports/repositorio-emisores.js';

/** `FE_PRODUCCION_PERMITIDA` y `FE_SIMULADO_PERMITIDO` del ambiente (spec 50). */
export interface ReglasEntornoFe {
  produccionPermitida: boolean;
  simuladoPermitido: boolean;
}

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
  entorno: ReglasEntornoFe;
}

export const ENTIDAD_EMISOR = 'emisor_fe';
export const ACCIONES_EMISOR = {
  configurar: 'fe.emisor.configurar',
  cargarCertificado: 'fe.emisor.cargar_certificado',
  solicitarPrueba: 'fe.emisor.solicitar_prueba',
  habilitarProduccion: 'fe.emisor.habilitar_produccion',
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

export function esSimulado(proveedor: ProveedorFe): boolean {
  return proveedor.codigo === PROVEEDORES_CON_ADAPTADOR.simulado;
}

/** El simulador solo donde el ambiente lo permite (dev y CI): en los demás es como si no existiera. */
export function exigirProveedorDelAmbiente(proveedor: ProveedorFe, entorno: ReglasEntornoFe): void {
  if (esSimulado(proveedor) && !entorno.simuladoPermitido) throw new ProveedorFeInvalidoError();
}

/**
 * Con dominios permitidos la URL es obligatoria y debe ser de uno de ellos; sin dominios el proveedor no recibe URL.
 * Así el worker nunca llama a un host que el catálogo no declara (anti-SSRF).
 */
export function urlDelProveedor(url: string | null, proveedor: ProveedorFe): string | null {
  if (proveedor.dominiosPermitidos.length === 0) {
    if (url !== null) throw new UrlProveedorNoPermitidaError();
    return null;
  }
  if (url === null) throw new UrlProveedorNoPermitidaError();
  return exigirUrlPermitida(url, proveedor.dominiosPermitidos);
}
