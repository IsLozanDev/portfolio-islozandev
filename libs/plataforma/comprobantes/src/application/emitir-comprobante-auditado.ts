import type { AuditoriaPort } from '@vitrina/plataforma/auditoria';
import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import { EmisionConcurrenteError } from '../domain/errores.js';
import type { ComprobanteEmitido, ComprobantePort, EmitirComprobanteComando } from './ports/comprobante.port.js';

export const ENTIDAD_COMPROBANTE = 'comprobante_fe';
export const ACCION_EMITIR_COMPROBANTE = 'fe.comprobante.emitir';

export interface DependenciasEmisionAuditada {
  unidadDeTrabajo: UnitOfWork;
  auditoria: AuditoriaPort;
  emision: ComprobantePort;
}

/**
 * La entrada HTTP (productos externos): su propia transacción, auditoría de la emisión en ella (TR-RNF-013) y, si
 * otra petición con la misma clave confirmó primero, un segundo intento que ya la encuentra y la devuelve.
 */
export class EmitirComprobanteAuditado {
  constructor(private readonly dependencias: DependenciasEmisionAuditada) {}

  async ejecutar(comando: EmitirComprobanteComando): Promise<ComprobanteEmitido> {
    try {
      return await this.emitirYAuditar(comando);
    } catch (error) {
      if (!(error instanceof EmisionConcurrenteError)) throw error;
      return this.emitirYAuditar(comando);
    }
  }

  private emitirYAuditar(comando: EmitirComprobanteComando): Promise<ComprobanteEmitido> {
    const { unidadDeTrabajo, auditoria, emision } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const emitido = await emision.emitir(comando);
      if (emitido.repetido) return emitido;
      await auditoria.registrar({
        accion: ACCION_EMITIR_COMPROBANTE,
        entidadTipo: ENTIDAD_COMPROBANTE,
        entidadId: emitido.comprobanteId,
        despues: emitido,
      });
      return emitido;
    });
  }
}
