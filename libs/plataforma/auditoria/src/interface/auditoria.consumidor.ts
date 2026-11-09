import { SuscribirEvento, type EventoEntregado } from '@vitrina/plataforma/eventos';
import type { AuditarEventoDePlataforma } from '../application/auditar-evento-de-plataforma.js';

const CONSUMIDOR = 'auditoria';

/**
 * Eventos de ORG y suscripción que se auditan. Fuera: `suscripcion.por_vencer` (aviso, no operación) y
 * `seq.numero.emitido` (volumen alto, sin valor de auditoría). Idempotente por `sync.evento_procesado`
 * y por `ux_evento_auditoria_evento`.
 */
export const EVENTOS_AUDITADOS = [
  'tenant.creado',
  'tenant.suspendido',
  'tenant.reactivado',
  'tenant.dado_de_baja',
  'suscripcion.cambiada',
  'suscripcion.vencida',
  'empresa.creada',
  'empresa.actualizada',
  'sucursal.creada',
  'sucursal.actualizada',
  'sucursal.inactivada',
  'unidad.creada',
  'unidad.actualizada',
  'unidad.inactivada',
] as const;

/** Un método por tipo: `@SuscribirEvento` registra un tipo por método. */
export class AuditoriaConsumidor {
  constructor(private readonly auditarEvento: AuditarEventoDePlataforma) {}

  @SuscribirEvento('tenant.creado', { consumidor: CONSUMIDOR })
  tenantCreado(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('tenant.suspendido', { consumidor: CONSUMIDOR })
  tenantSuspendido(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('tenant.reactivado', { consumidor: CONSUMIDOR })
  tenantReactivado(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('tenant.dado_de_baja', { consumidor: CONSUMIDOR })
  tenantDadoDeBaja(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('suscripcion.cambiada', { consumidor: CONSUMIDOR })
  suscripcionCambiada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('suscripcion.vencida', { consumidor: CONSUMIDOR })
  suscripcionVencida(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('empresa.creada', { consumidor: CONSUMIDOR })
  empresaCreada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('empresa.actualizada', { consumidor: CONSUMIDOR })
  empresaActualizada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('sucursal.creada', { consumidor: CONSUMIDOR })
  sucursalCreada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('sucursal.actualizada', { consumidor: CONSUMIDOR })
  sucursalActualizada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('sucursal.inactivada', { consumidor: CONSUMIDOR })
  sucursalInactivada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('unidad.creada', { consumidor: CONSUMIDOR })
  unidadCreada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('unidad.actualizada', { consumidor: CONSUMIDOR })
  unidadActualizada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }

  @SuscribirEvento('unidad.inactivada', { consumidor: CONSUMIDOR })
  unidadInactivada(evento: EventoEntregado): Promise<void> {
    return this.auditarEvento.ejecutar(evento);
  }
}
