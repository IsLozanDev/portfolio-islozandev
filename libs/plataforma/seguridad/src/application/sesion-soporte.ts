import { ConflictError, type Clock, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { SoporteNoEncontradoError, SoporteNoVigenteError } from '../domain/errores.js';
import type { LecturaSoporte } from './ports/lectura-soporte.js';
import type { UsuariosIdentidad } from './ports/repositorios.js';
import type { TenantsSoporte } from './ports/tenants-soporte.port.js';

export interface DependenciasSesionSoporte {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  lectura: Pick<LecturaSoporte, 'deAgente'>;
  usuarios: Pick<UsuariosIdentidad, 'fijarTenantPreferido'>;
  tenants: Pick<TenantsSoporte, 'idDelCodigo'>;
  /** Código del tenant operador (ORG_TENANT_OPERADOR). */
  tenantOperador: string;
}

export interface EntradaASoporte {
  tenantId: string;
  hasta: Date;
}

/** seg.usuario no tiene RLS: el tenant del contexto solo abre la transacción. */
function fijarPreferido(dependencias: DependenciasSesionSoporte, usuarioId: string, tenantActual: string, tenantId: string): Promise<void> {
  const { contexto, unidadDeTrabajo, usuarios } = dependencias;
  return contexto.run({ tenantId: tenantActual }, () => unidadDeTrabajo.run(() => usuarios.fijarTenantPreferido(usuarioId, tenantId)));
}

/**
 * El agente, con el token del operador, elige entrar al tenant del cliente: el hook lo pondrá en el
 * próximo token. El front hace `refreshSession()` con la respuesta.
 */
export class EntrarComoSoporte {
  constructor(private readonly dependencias: DependenciasSesionSoporte) {}

  async ejecutar(accesoId: string, agenteId: string, tenantActual: string): Promise<EntradaASoporte> {
    const { lectura, reloj } = this.dependencias;
    const acceso = (await lectura.deAgente(agenteId)).find((propio) => propio.id === accesoId);
    if (!acceso) throw new SoporteNoEncontradoError();
    if (acceso.estado !== 'APROBADO' || !acceso.hasta || acceso.hasta <= reloj.now()) throw new SoporteNoVigenteError();
    await fijarPreferido(this.dependencias, agenteId, tenantActual, acceso.tenantId);
    return { tenantId: acceso.tenantId, hasta: acceso.hasta };
  }
}

/**
 * Devuelve al agente al tenant operador, el de su membresía propia: los agentes solo solicitan desde
 * allí (spec 18). Idempotente. Sin @Permiso: en el tenant del cliente el agente no tiene plat.soporte.solicitar.
 */
export class SalirDeSoporte {
  constructor(private readonly dependencias: DependenciasSesionSoporte) {}

  async ejecutar(agenteId: string, tenantActual: string): Promise<void> {
    const { tenants, tenantOperador } = this.dependencias;
    const operador = await tenants.idDelCodigo(tenantOperador);
    if (!operador) throw new ConflictError('El tenant operador no existe');
    await fijarPreferido(this.dependencias, agenteId, tenantActual, operador);
  }
}
