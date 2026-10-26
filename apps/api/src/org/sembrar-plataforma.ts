import type { IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { CrearTenant, RegistrarEmpresa } from '@vitrina/plataforma/org';
import type { InvitarPropietario } from '@vitrina/plataforma/seguridad';
import type { TenantsPorCodigo } from './alta-tenant.js';

const NOMBRE_OPERADOR = 'Plataforma';
const ROL_ADMIN_TENANTS = 'PLAT_ADMIN_TENANTS';

export interface SembrarPlataformaComando {
  correo: string;
  nombre: string;
}

export type ResultadoSiembra =
  | { sinCambios: true; tenantId: string }
  | { sinCambios: false; tenantId: string; tenantCreado: boolean; membresiaId: string; usuarioNuevo: boolean; correoEnviado: boolean };

export interface DependenciasSiembra {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  tenantsPorCodigo: TenantsPorCodigo;
  crearTenant: Pick<CrearTenant, 'ejecutar'>;
  registrarEmpresa: Pick<RegistrarEmpresa, 'ejecutar'>;
  invitarPropietario: Pick<InvitarPropietario, 'esMiembro' | 'prepararIdentidad' | 'registrar' | 'notificar'>;
  tenantOperador: string;
  rucOperador: string;
}

/**
 * Tenant operador y su primer administrador (spec 12): sin él nadie puede llamar a POST /v1/org/tenants.
 * Idempotente: con el tenant y la membresía del correo ya creados no cambia nada. Crear el tenant,
 * su empresa y la membresía va en una sola transacción; Supabase, antes y después, como en el alta.
 */
export class SembrarPlataforma {
  constructor(private readonly dependencias: DependenciasSiembra) {}

  async ejecutar({ correo, nombre }: SembrarPlataformaComando): Promise<ResultadoSiembra> {
    const { contexto, ids, tenantsPorCodigo, invitarPropietario, tenantOperador } = this.dependencias;
    const existente = await tenantsPorCodigo.idDe(tenantOperador);
    if (existente && (await contexto.run({ tenantId: existente }, () => invitarPropietario.esMiembro(correo)))) {
      return { sinCambios: true, tenantId: existente };
    }

    const tenantId = existente ?? ids.next();
    return contexto.run({ tenantId }, async () => {
      const identidad = await invitarPropietario.prepararIdentidad(correo, nombre);
      const { membresiaId } = await this.dependencias.unidadDeTrabajo.run(async () => {
        if (!existente) await this.crearOperador(tenantId);
        // Sin actor humano: el primer administrador figura como quien se invitó.
        return invitarPropietario.registrar(identidad, identidad.usuarioId, [ROL_ADMIN_TENANTS]);
      });
      const { correoEnviado } = await invitarPropietario.notificar(identidad);
      return { sinCambios: false, tenantId, tenantCreado: !existente, membresiaId, usuarioNuevo: identidad.usuarioNuevo, correoEnviado };
    });
  }

  /** ACTIVO y sin suscripción: PLAT no se contrata y sus permisos no dependen de una (TR-RN-006). */
  private async crearOperador(tenantId: string): Promise<void> {
    const { crearTenant, registrarEmpresa, tenantOperador, rucOperador } = this.dependencias;
    await crearTenant.ejecutar({ id: tenantId, codigo: tenantOperador, nombre: NOMBRE_OPERADOR, estado: 'ACTIVO' });
    await registrarEmpresa.ejecutar({ ruc: rucOperador, razonSocial: NOMBRE_OPERADOR, nombreComercial: null, direccionFiscal: null, ubigeo: null });
  }
}
