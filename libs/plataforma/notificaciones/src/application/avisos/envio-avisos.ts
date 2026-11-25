import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { PropietariosTenant } from '@vitrina/plataforma/seguridad';
import type { CodigoAviso } from '../../domain/avisos-plataforma.js';
import { claveDeAviso } from '../../domain/clave-aviso.js';
import { FINALIDAD_TRANSACCIONAL } from '../../domain/finalidad-notificacion.js';
import type { ValoresVariables } from '../../domain/renderizador-plantilla.js';
import type { Registrar } from '../dependencias.js';
import type { NombreTenant } from '../ports/nombre-tenant.js';
import type { NotificacionPort, NotificacionRegistrada } from '../ports/notificacion.port.js';

export const EVENTO_AVISO_REGISTRADO = 'not.aviso.registrado';
export const EVENTO_AVISO_SIN_DESTINATARIOS = 'not.aviso.sin_destinatarios';
const SIN_PROPIETARIOS = 'SIN_PROPIETARIOS_ACTIVOS';
const SIN_CORREO_OPERACION = 'SIN_NOT_CORREO_OPERACION';

/** Lo que los avisos usan del evento entregado: el tenant ya está en el contexto (lo arma el relay). */
export interface EventoDeAviso<Carga> {
  eventId: string;
  tenantId: string;
  payload: Carga;
}

export interface DependenciasAvisos {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  notificaciones: NotificacionPort;
  propietarios: Pick<PropietariosTenant, 'listar'>;
  nombreTenant: NombreTenant;
  /** `NOT_CORREO_OPERACION`: destino de `aud.integridad.rota`. */
  correoOperacion: string | undefined;
  /** Zona de las fechas de los avisos (America/Lima). */
  zonaHoraria: string;
  informar: Registrar;
  avisar: Registrar;
}

/**
 * Un mensaje TRANSACCIONAL por destinatario en la transacción del evento, con clave determinista por
 * `event_id` y destino (TR-RNF-008). Sin destinatarios, un log de advertencia y el evento se da por consumido.
 * Los logs llevan cantidades y estados, nunca correos (TR-RNF-026).
 */
export class EnvioAvisos {
  constructor(private readonly dependencias: DependenciasAvisos) {}

  get zonaHoraria(): string {
    return this.dependencias.zonaHoraria;
  }

  aPropietarios<Carga>(evento: EventoDeAviso<Carga>, plantilla: CodigoAviso, variablesCon: (tenant: string) => ValoresVariables): Promise<void> {
    return this.dependencias.unidadDeTrabajo.run(async () => {
      const propietarios = await this.dependencias.propietarios.listar();
      if (propietarios.length === 0) return this.registrarSinDestinatarios(evento, plantilla, SIN_PROPIETARIOS);
      const correos = propietarios.map((propietario) => propietario.correo);
      const variables = variablesCon(await this.nombreDelTenant());
      await this.enviar(evento, plantilla, correos, variables);
    });
  }

  aOperacion<Carga>(evento: EventoDeAviso<Carga>, plantilla: CodigoAviso, variables: ValoresVariables): Promise<void> {
    const correoOperacion = this.dependencias.correoOperacion;
    if (!correoOperacion) return Promise.resolve(this.registrarSinDestinatarios(evento, plantilla, SIN_CORREO_OPERACION));
    return this.dependencias.unidadDeTrabajo.run(() => this.enviar(evento, plantilla, [correoOperacion], variables));
  }

  private async enviar<Carga>(evento: EventoDeAviso<Carga>, plantilla: CodigoAviso, correos: readonly string[], variables: ValoresVariables): Promise<void> {
    const registradas: NotificacionRegistrada[] = [];
    for (const correo of correos) {
      registradas.push(
        await this.dependencias.notificaciones.enviar({
          plantilla,
          destinatario: { correo },
          variables,
          finalidad: FINALIDAD_TRANSACCIONAL,
          claveIdempotencia: claveDeAviso(evento.eventId, correo),
        }),
      );
    }
    this.dependencias.informar(EVENTO_AVISO_REGISTRADO, {
      event_id: evento.eventId,
      tenant_id: evento.tenantId,
      plantilla,
      destinatarios: registradas.length,
      repetidos: registradas.filter((registrada) => registrada.repetida).length,
      estados: contarEstados(registradas),
    });
  }

  private async nombreDelTenant(): Promise<string> {
    return (await this.dependencias.nombreTenant.obtener()) ?? this.dependencias.contexto.current().tenantId;
  }

  private registrarSinDestinatarios<Carga>(evento: EventoDeAviso<Carga>, plantilla: CodigoAviso, motivo: string): void {
    this.dependencias.avisar(EVENTO_AVISO_SIN_DESTINATARIOS, { event_id: evento.eventId, tenant_id: evento.tenantId, plantilla, motivo });
  }
}

function contarEstados(registradas: readonly NotificacionRegistrada[]): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const { estado } of registradas) conteo[estado] = (conteo[estado] ?? 0) + 1;
  return conteo;
}
