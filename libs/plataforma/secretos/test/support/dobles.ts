import { randomBytes } from 'node:crypto';
import type { AuditoriaPort, EntradaAuditoria } from '@vitrina/plataforma/auditoria';
import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ClavesDeDatos } from '../../src/application/claves-de-datos.js';
import type { DependenciasBoveda } from '../../src/application/dependencias-boveda.js';
import type { ClaveTenantGuardada, RepositorioClavesTenant } from '../../src/application/ports/repositorio-claves-tenant.js';
import type { RepositorioSecretos, SecretoGuardado } from '../../src/application/ports/repositorio-secretos.js';
import type { TenantsPorReenvolver } from '../../src/application/ports/tenants-por-reenvolver.js';
import { BYTES_CLAVE, ClavesMaestras } from '../../src/domain/claves-maestras.js';
import { SecretoModificadoError } from '../../src/domain/errores.js';
import { CifradorAesGcm } from '../../src/infrastructure/crypto/cifrador.aes-gcm.js';

export const AHORA = new Date('2026-11-20T15:00:00Z');

export function clavesMaestrasDePrueba(versiones: readonly number[], activa: number, existentes = new Map<number, Uint8Array>()): ClavesMaestras {
  const claves = new Map(versiones.map((version) => [version, existentes.get(version) ?? randomBytes(BYTES_CLAVE)]));
  return ClavesMaestras.crear(claves, activa);
}

export class ClavesTenantMemoria implements RepositorioClavesTenant {
  readonly filas = new Map<string, ClaveTenantGuardada>();

  constructor(private readonly contexto: TenantContext) {}

  async obtener(): Promise<ClaveTenantGuardada | null> {
    return this.filas.get(this.contexto.current().tenantId) ?? null;
  }

  async crearSiNoExiste(clave: ClaveTenantGuardada): Promise<ClaveTenantGuardada> {
    const existente = this.filas.get(clave.tenantId);
    if (existente) return existente;
    this.filas.set(clave.tenantId, clave);
    return clave;
  }

  async reenvolver(clave: ClaveTenantGuardada): Promise<void> {
    this.filas.set(this.contexto.current().tenantId, clave);
  }
}

export class TenantsPorReenvolverMemoria implements TenantsPorReenvolver {
  constructor(private readonly claves: ClavesTenantMemoria) {}

  async listar(versionActiva: number, limite: number): Promise<string[]> {
    return [...this.claves.filas.values()]
      .filter((clave) => clave.versionClaveMaestra !== versionActiva)
      .map((clave) => clave.tenantId)
      .sort()
      .slice(0, limite);
  }
}

export class SecretosMemoria implements RepositorioSecretos {
  readonly filas = new Map<string, SecretoGuardado>();

  constructor(private readonly contexto: TenantContext) {}

  async obtener(secretoId: string): Promise<SecretoGuardado | null> {
    const fila = this.filas.get(secretoId);
    return fila && fila.tenantId === this.tenantId ? { ...fila } : null;
  }

  async insertar(secreto: SecretoGuardado): Promise<void> {
    this.filas.set(secreto.id, { ...secreto });
  }

  async actualizar(secreto: SecretoGuardado, versionEsperada: number): Promise<void> {
    const actual = await this.obtener(secreto.id);
    if (!actual || actual.version !== versionEsperada) throw new SecretoModificadoError();
    this.filas.set(secreto.id, { ...secreto, version: versionEsperada + 1 });
  }

  async borrar(secretoId: string): Promise<boolean> {
    if (!(await this.obtener(secretoId))) return false;
    return this.filas.delete(secretoId);
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

export class AuditoriaDoble implements AuditoriaPort {
  readonly entradas: EntradaAuditoria[] = [];

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    this.entradas.push(entrada);
  }

  async registrarAccesoSensible(): Promise<void> {
    throw new Error('la bóveda no registra accesos sensibles');
  }
}

export const unidadDeTrabajoDirecta: UnitOfWork = { run: (trabajo) => trabajo() };
export const relojFijo: Clock = { now: () => AHORA };

export interface Registro {
  mensaje: string;
  datos: Record<string, unknown>;
}

export interface EscenarioBoveda {
  contexto: AlsTenantContext;
  clavesTenant: ClavesTenantMemoria;
  secretos: SecretosMemoria;
  auditoria: AuditoriaDoble;
  registros: Registro[];
  dependencias: (claves: ClavesMaestras | undefined) => DependenciasBoveda;
}

export function crearEscenario(): EscenarioBoveda {
  const contexto = new AlsTenantContext();
  const clavesTenant = new ClavesTenantMemoria(contexto);
  const secretos = new SecretosMemoria(contexto);
  const auditoria = new AuditoriaDoble();
  const registros: Registro[] = [];
  const cifrador = new CifradorAesGcm();
  return {
    contexto,
    clavesTenant,
    secretos,
    auditoria,
    registros,
    dependencias: (claves) => ({
      unidadDeTrabajo: unidadDeTrabajoDirecta,
      contexto,
      reloj: relojFijo,
      ids: { next: uuidV7 },
      auditoria,
      cifrador,
      clavesDeDatos: new ClavesDeDatos(cifrador, clavesTenant, claves),
      secretos,
      informar: (mensaje, datos) => registros.push({ mensaje, datos }),
    }),
  };
}
