import { exigirCanalHabilitado } from '../../domain/canal.js';
import { SinPersonalizacionError } from '../../domain/errores.js';
import { IDIOMA_POR_DEFECTO } from '../../domain/plantilla.js';
import type { DependenciasPlantillas } from '../dependencias.js';
import { ACCIONES_PLANTILLA, ENTIDAD_PLANTILLA, entidadIdDe, huellaDe } from './vista-plantilla.js';

/** Desactiva las versiones del tenant y vuelve a regir la base, que no cambia. Las versiones no se borran. */
export class RestaurarPlantillaBase {
  constructor(private readonly dependencias: Pick<DependenciasPlantillas, 'unidadDeTrabajo' | 'plantillas' | 'auditoria'>) {}

  async ejecutar(codigo: string, canalSolicitado: string): Promise<void> {
    const canal = exigirCanalHabilitado(canalSolicitado);
    const { unidadDeTrabajo, plantillas, auditoria } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const vigenteDelTenant = await plantillas.vigenteDelTenant(codigo, canal, IDIOMA_POR_DEFECTO);
      const desactivadas = await plantillas.desactivarPersonalizacion(codigo, canal, IDIOMA_POR_DEFECTO);
      if (!vigenteDelTenant || desactivadas === 0) throw new SinPersonalizacionError(codigo);
      const base = await plantillas.base(codigo, canal, IDIOMA_POR_DEFECTO);
      await auditoria.registrar({
        accion: ACCIONES_PLANTILLA.restaurar,
        entidadTipo: ENTIDAD_PLANTILLA,
        entidadId: entidadIdDe(codigo, canal),
        antes: huellaDe(vigenteDelTenant),
        despues: base ? huellaDe(base) : null,
      });
    });
  }
}
