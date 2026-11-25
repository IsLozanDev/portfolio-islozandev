import { exigirUsuario } from '../consentimientos/exigencias.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import { ENTIDAD_AUDITADA, exigirParDelTenant, paraAuditoria } from './par-del-tenant.js';

export const ACCION_DESCARTAR_PAR = 'plat.persona.duplicado.descartar';

/** «No son la misma persona»: el par no se vuelve a proponer. Idempotente; queda auditado. */
export class DescartarPar {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  ejecutar(unaPersonaId: string, otraPersonaId: string): Promise<void> {
    const { unidadDeTrabajo, personas, fusiones, contexto, reloj, auditoria } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const par = await exigirParDelTenant(personas, unaPersonaId, otraPersonaId);
      await fusiones.descartar(par, exigirUsuario(contexto), reloj.now());
      await auditoria.registrar({ accion: ACCION_DESCARTAR_PAR, entidadTipo: ENTIDAD_AUDITADA, entidadId: par.menor, despues: paraAuditoria(par) });
    });
  }
}
