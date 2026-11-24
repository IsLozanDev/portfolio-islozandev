import { exigirCanalHabilitado } from '../../domain/canal.js';
import { IDIOMA_POR_DEFECTO } from '../../domain/plantilla.js';
import type { DependenciasPlantillas } from '../dependencias.js';

/** Una versión del historial, sin asunto ni cuerpo. */
export interface VersionPlantilla {
  version: number;
  activa: boolean;
  creadoPor: string | null;
  creadoEn: Date;
}

/** Historial de personalizaciones del tenant, de la más nueva a la más vieja. */
export class ListarVersionesPlantilla {
  constructor(private readonly dependencias: Pick<DependenciasPlantillas, 'unidadDeTrabajo' | 'plantillas'>) {}

  async ejecutar(codigo: string, canalSolicitado: string): Promise<VersionPlantilla[]> {
    const canal = exigirCanalHabilitado(canalSolicitado);
    const { unidadDeTrabajo, plantillas } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const versiones = await plantillas.versiones(codigo, canal, IDIOMA_POR_DEFECTO);
      return versiones.map(({ version, activa, creadoPor, creadoEn }) => ({ version, activa, creadoPor, creadoEn }));
    });
  }
}
