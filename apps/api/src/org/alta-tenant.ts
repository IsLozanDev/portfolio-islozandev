import { ConflictError, ValidationError, type Clock, type IdGenerator } from '@vitrina/plataforma/kernel';
import type { SembrarSeriesIniciales } from '@vitrina/plataforma/correlativos';
import {
  CodigoTenant,
  fechaCalendarioDe,
  sumarDias,
  type CrearTenant,
  type FechaCalendario,
  type GestionarSuscripcion,
  type Plan,
  type ProductoCodigo,
  type RegistrarEmpresa,
} from '@vitrina/plataforma/org';
import type { ParametroPort } from '@vitrina/plataforma/parametros';
import type { IdentidadPropietario, InvitarPropietario } from '@vitrina/plataforma/seguridad';
import { validarRuc } from '@vitrina/shared/util';
import { ExigirOperador, type DependenciasOperador } from './operador.js';

const PARAMETRO_DIAS_PRUEBA = 'plat.suscripcion.dias_prueba';
export const MENSAJE_TENANT_DUPLICADO = 'El código de tenant ya existe';

export type Modalidad = 'PRUEBA' | 'ACTIVO';

export class TenantDuplicadoError extends ConflictError {
  override readonly code = 'TENANT_DUPLICADO';

  constructor() {
    super(MENSAJE_TENANT_DUPLICADO);
  }
}

export class RucInvalidoError extends ValidationError {
  override readonly code = 'RUC_INVALIDO';

  constructor() {
    super('RUC inválido');
  }
}

export interface AltaTenantComando {
  codigo: string;
  nombre: string;
  productoCodigo: ProductoCodigo;
  plan: Plan;
  modalidad: Modalidad;
  /** Obligatoria en ACTIVO; en PRUEBA, por defecto hoy + plat.suscripcion.dias_prueba. */
  vigenteHasta?: FechaCalendario | null;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  correoPropietario: string;
  nombrePropietario: string;
  actor: { usuarioId: string; tenantId: string };
}

export interface TenantDadoDeAlta {
  tenantId: string;
  estado: Modalidad;
  suscripcionId: string;
  vigenteHasta: FechaCalendario;
  empresaId: string;
  sucursalId: string;
  membresiaId: string;
  invitacionId: string;
  expiraEn: Date;
  usuarioNuevo: boolean;
  correoEnviado: boolean;
}

/** Id del tenant con ese código, o null. Busca entre tenants, por `org.tenant_por_codigo`. */
export interface TenantsPorCodigo {
  idDe(codigo: string): Promise<string | null>;
}

export interface DependenciasAlta extends DependenciasOperador {
  ids: IdGenerator;
  reloj: Clock;
  tenantsPorCodigo: TenantsPorCodigo;
  parametros: Pick<ParametroPort, 'valor'>;
  crearTenant: Pick<CrearTenant, 'ejecutar'>;
  gestionarSuscripcion: Pick<GestionarSuscripcion, 'ejecutar'>;
  registrarEmpresa: Pick<RegistrarEmpresa, 'ejecutar'>;
  sembrarSeries: Pick<SembrarSeriesIniciales, 'ejecutar'>;
  invitarPropietario: Pick<InvitarPropietario, 'prepararIdentidad' | 'registrar' | 'notificar'>;
}

/**
 * TR-RF-001. Orquesta org, seguridad y correlativos en una sola transacción con el tenant nuevo en
 * el contexto. Vive en apps/api porque org no puede importar seguridad ni correlativos (PL-10).
 * Supabase se llama antes de la transacción (crear usuario) y después del commit (enlace).
 */
export class AltaTenant {
  private readonly exigirOperador: ExigirOperador;

  constructor(private readonly dependencias: DependenciasAlta) {
    this.exigirOperador = new ExigirOperador(dependencias);
  }

  async ejecutar(comando: AltaTenantComando): Promise<TenantDadoDeAlta> {
    await this.exigirOperador.ejecutar(comando.actor);
    const hoy = fechaCalendarioDe(this.dependencias.reloj.now());
    validarComando(comando, hoy);
    if ((await this.dependencias.tenantsPorCodigo.idDe(comando.codigo)) !== null) throw new TenantDuplicadoError();

    const tenantId = this.dependencias.ids.next();
    return this.dependencias.contexto.run({ tenantId }, async () => {
      const vigenteHasta = comando.vigenteHasta ?? (await this.finDePrueba(hoy));
      const identidad = await this.dependencias.invitarPropietario.prepararIdentidad(comando.correoPropietario, comando.nombrePropietario);
      const alta = await this.registrarEnTransaccion(tenantId, comando, vigenteHasta, identidad);
      const { correoEnviado } = await this.dependencias.invitarPropietario.notificar(identidad);
      return { ...alta, usuarioNuevo: identidad.usuarioNuevo, correoEnviado };
    });
  }

  /** Sin tenant de cliente en la base todavía, el parámetro resuelve a su defecto. */
  private async finDePrueba(hoy: FechaCalendario): Promise<FechaCalendario> {
    const { valor } = await this.dependencias.parametros.valor<number>(PARAMETRO_DIAS_PRUEBA);
    return sumarDias(hoy, valor);
  }

  private async registrarEnTransaccion(
    tenantId: string,
    comando: AltaTenantComando,
    vigenteHasta: FechaCalendario,
    identidad: IdentidadPropietario,
  ): Promise<Omit<TenantDadoDeAlta, 'usuarioNuevo' | 'correoEnviado'>> {
    const { unidadDeTrabajo, crearTenant, gestionarSuscripcion, registrarEmpresa, sembrarSeries, invitarPropietario } = this.dependencias;
    try {
      return await unidadDeTrabajo.run(async () => {
        await crearTenant.ejecutar({ id: tenantId, codigo: comando.codigo, nombre: comando.nombre, estado: comando.modalidad });
        const { suscripcionId } = await gestionarSuscripcion.ejecutar({
          tenantId,
          productoCodigo: comando.productoCodigo,
          edicion: null,
          plan: comando.plan,
          estado: comando.modalidad === 'PRUEBA' ? 'PRUEBA' : 'ACTIVA',
          limiteSucursales: null,
          limiteUsuarios: null,
          vigenteHasta,
        });
        const { empresaId, sucursalPrincipalId } = await registrarEmpresa.ejecutar({
          ruc: comando.ruc,
          razonSocial: comando.razonSocial,
          nombreComercial: comando.nombreComercial ?? null,
          direccionFiscal: null,
          ubigeo: null,
        });
        await sembrarSeries.ejecutar({ empresaId, sucursalId: sucursalPrincipalId, creadoPor: comando.actor.usuarioId });
        const propietario = await invitarPropietario.registrar(identidad, comando.actor.usuarioId);
        return { tenantId, estado: comando.modalidad, suscripcionId, vigenteHasta, empresaId, sucursalId: sucursalPrincipalId, ...propietario };
      });
    } catch (error) {
      // Carrera con otra alta del mismo código entre la consulta y el INSERT: la transacción ya revirtió.
      if (error instanceof ConflictError && error.message === MENSAJE_TENANT_DUPLICADO) throw new TenantDuplicadoError();
      throw error;
    }
  }
}

/** Todo lo que se puede rechazar sin base ni Supabase (TR-CA-003 incluido). */
function validarComando(comando: AltaTenantComando, hoy: FechaCalendario): void {
  CodigoTenant.de(comando.codigo);
  if (!validarRuc(comando.ruc)) throw new RucInvalidoError();
  if (!comando.razonSocial.trim()) throw new ValidationError('La razón social es obligatoria');
  if (comando.modalidad === 'ACTIVO' && !(comando.vigenteHasta && comando.vigenteHasta > hoy)) {
    throw new ValidationError('Un tenant ACTIVO exige vigente_hasta posterior a hoy');
  }
}
