import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { FechaCalendario } from '../domain/fecha-calendario.js';
import { debeSuspenderse, MOTIVO_FIN_DE_GRACIA } from '../domain/regla-gracia.js';
import type { Suscripcion } from '../domain/suscripcion.js';
import type { Tenant } from '../domain/tenant.js';
import { buscarTenant } from './comunes.js';
import type { RepositorioSuscripciones, RepositorioTenants } from './ports/repositorios.js';
import type { DiasGracia, Informar, RepositorioAvisos, SuscripcionesARevisar } from './ports/vencimientos.js';
import { publicarEventos } from './publicar-eventos.js';

export interface ResultadoTenant {
  avisos: number;
  vencidas: number;
  suspendido: boolean;
}

export interface ResultadoVencimientos {
  fecha: FechaCalendario;
  avisos: number;
  vencidas: number;
  suspendidos: number;
  fallidos: number;
}

export interface DependenciasVencimiento {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  tenants: RepositorioTenants;
  suscripciones: RepositorioSuscripciones;
  avisos: RepositorioAvisos;
  diasGracia: DiasGracia;
}

/** TR-RF-007 para un tenant, en su propia transacción y con su RLS. Repetirlo el mismo día no cambia nada. */
export class ProcesarVencimientosTenant {
  constructor(private readonly dependencias: DependenciasVencimiento) {}

  ejecutar(tenantId: string, fecha: FechaCalendario): Promise<ResultadoTenant> {
    const { contexto, unidadDeTrabajo } = this.dependencias;
    return contexto.run({ tenantId }, () => unidadDeTrabajo.run(() => this.procesar(fecha)));
  }

  private async procesar(fecha: FechaCalendario): Promise<ResultadoTenant> {
    const { tenants, suscripciones, eventos } = this.dependencias;
    const tenant = await buscarTenant(tenants, this.dependencias.contexto);
    const lista = await suscripciones.listar();

    let avisos = 0;
    let vencidas = 0;
    for (const suscripcion of lista) {
      if (await this.avisar(suscripcion, fecha)) avisos += 1;
      if (suscripcion.vencer(fecha)) vencidas += 1;
      await suscripciones.guardar(suscripcion);
      await publicarEventos(eventos, suscripcion);
    }

    const suspendido = await this.suspenderSiAgotoGracia(tenant, lista, fecha);
    return { avisos, vencidas, suspendido };
  }

  /** El registro va primero: si ya existía, no se levanta el evento ni sube la versión. */
  private async avisar(suscripcion: Suscripcion, fecha: FechaCalendario): Promise<boolean> {
    const diasAntes = suscripcion.diaDeAviso(fecha);
    if (diasAntes === null || suscripcion.datos.vigenteHasta === null) return false;
    const registrado = await this.dependencias.avisos.registrar({
      id: this.dependencias.ids.next(),
      tenantId: suscripcion.tenantId,
      suscripcionId: suscripcion.id,
      diasAntes,
      vigenteHasta: suscripcion.datos.vigenteHasta,
      fechaEjecucion: fecha,
    });
    if (registrado) suscripcion.avisarVencimiento(fecha);
    return registrado;
  }

  private async suspenderSiAgotoGracia(tenant: Tenant, lista: readonly Suscripcion[], fecha: FechaCalendario): Promise<boolean> {
    if (tenant.estado !== 'PRUEBA' && tenant.estado !== 'ACTIVO') return false;
    const { diasGracia, reloj, tenants, ids, eventos } = this.dependencias;
    if (!debeSuspenderse(lista, await diasGracia.de(tenant.id), fecha)) return false;

    const cambio = tenant.cambiarEstado('SUSPENDIDO', MOTIVO_FIN_DE_GRACIA, reloj.now());
    if (!cambio) return false;
    await tenants.guardar(tenant);
    await tenants.registrarCambioEstado(ids.next(), tenant.id, cambio, null);
    await publicarEventos(eventos, tenant);
    return true;
  }
}

/** Tarea diaria (TR-RF-007): un tenant por transacción; el fallo de uno no detiene a los demás. */
export class RevisarVencimientos {
  constructor(
    private readonly lector: SuscripcionesARevisar,
    private readonly procesarTenant: ProcesarVencimientosTenant,
    private readonly informar: Informar,
    private readonly avisar: Informar,
  ) {}

  async ejecutar(fecha: FechaCalendario): Promise<ResultadoVencimientos> {
    const tenantIds = [...new Set((await this.lector.listar(fecha)).map((fila) => fila.tenantId))];
    const resultado: ResultadoVencimientos = { fecha, avisos: 0, vencidas: 0, suspendidos: 0, fallidos: 0 };

    for (const tenantId of tenantIds) {
      try {
        const deTenant = await this.procesarTenant.ejecutar(tenantId, fecha);
        resultado.avisos += deTenant.avisos;
        resultado.vencidas += deTenant.vencidas;
        if (deTenant.suspendido) resultado.suspendidos += 1;
      } catch (error) {
        resultado.fallidos += 1;
        this.avisar('Vencimientos de un tenant fallaron', { tenant_id: tenantId, error: (error as Error).name });
      }
    }

    this.informar('Vencimientos revisados', { ...resultado, tenants: tenantIds.length });
    return resultado;
  }
}
