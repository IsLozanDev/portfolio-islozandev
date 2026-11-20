import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { Clock, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ClavesDeDatos } from './claves-de-datos.js';
import type { Cifrador } from './ports/cifrador.js';
import type { RepositorioSecretos } from './ports/repositorio-secretos.js';

export type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasBoveda {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  auditoria: AuditoriaPort;
  cifrador: Cifrador;
  clavesDeDatos: ClavesDeDatos;
  secretos: RepositorioSecretos;
  /** TR-RNF-026: solo ids y tipos, nunca valores ni claves. */
  informar: Registrar;
}

export const ENTIDAD_SECRETO = 'secreto';

export const ACCIONES_SECRETO = {
  guardar: 'plat.secreto.guardar',
  rotar: 'plat.secreto.rotar',
  eliminar: 'plat.secreto.eliminar',
} as const;
