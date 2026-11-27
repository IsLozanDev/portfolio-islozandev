import { exigirCanalHabilitado } from '../../domain/canal.js';
import { SinPersonalizacionError } from '../../domain/errores.js';
import { IDIOMA_POR_DEFECTO } from '../../domain/plantilla.js';
import type { DependenciasPlantillas } from '../dependencias.js';
import { ACCIONES_PLANTILLA, ENTIDAD_PLANTILLA, entidadIdDe, exigirBase, huellaDe } from './vista-plantilla.js';

/**
 * Desactiva las versiones del tenant y vuelve a regir la base, que no cambia. Las versiones no se borran. Sin base
 * personalizable: PLANTILLA_NO_ENCONTRADA.
 */
export class RestaurarPlantillaBase {
  constructor(private readonly dependencias: Pick<DependenciasPlantillas, 'unidadDeTrabajo' | 'plantillas' | 'auditoria'>) {}

  async ejecutar(codigo: string, canalSolicitado: string): Promise<void> {
    const canal = exigirCanalHabilitado(canalSolicitado);
    const { unidadDeTrabajo, plantillas, auditoria } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const base = await exigirBase(plantillas, codigo, canal);
      const vigenteDelTenant = await plantillas.vigenteDelTenant(codigo, canal, IDIOMA_POR_DEFECTO);
      const desactivadas = await plantillas.desactivarPersonalizacion(codigo, canal, IDIOMA_POR_DEFECTO);
      if (!vigenteDelTenant || desactivadas === 0) throw new SinPersonalizacionError(codigo);
      await auditoria.registrar({
        accion: ACCIONES_PLANTILLA.restaurar,
        entidadTipo: ENTIDAD_PLANTILLA,
        entidadId: entidadIdDe(codigo, canal),
        antes: huellaDe(vigenteDelTenant),
        despues: huellaDe(base),
      });
    });
  }
}
