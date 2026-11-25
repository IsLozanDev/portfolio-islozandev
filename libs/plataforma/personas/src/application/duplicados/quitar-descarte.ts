import { DescarteNoEncontradoError } from '../../domain/errores.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import { ENTIDAD_AUDITADA, exigirParDelTenant, paraAuditoria } from './par-del-tenant.js';

export const ACCION_QUITAR_DESCARTE = 'plat.persona.duplicado.quitar_descarte';

/** El par vuelve a la lista de candidatos si cumple alguna regla; queda auditado. */
export class QuitarDescarte {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'personas' | 'fusiones' | 'auditoria'>) {}

  ejecutar(unaPersonaId: string, otraPersonaId: string): Promise<void> {
    const { unidadDeTrabajo, personas, fusiones, auditoria } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const par = await exigirParDelTenant(personas, unaPersonaId, otraPersonaId);
      if (!(await fusiones.quitarDescarte(par))) throw new DescarteNoEncontradoError();
      await auditoria.registrar({ accion: ACCION_QUITAR_DESCARTE, entidadTipo: ENTIDAD_AUDITADA, entidadId: par.menor, antes: paraAuditoria(par) });
    });
  }
}
