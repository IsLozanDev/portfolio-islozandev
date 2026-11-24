import { exigirCanalHabilitado } from '../../domain/canal.js';
import type { DependenciasPlantillas } from '../dependencias.js';
import { detalleDe, vigenteConSuBase, type DetallePlantilla } from './vista-plantilla.js';

/** La vigente para el tenant con el texto de la base. Sin base: PLANTILLA_NO_ENCONTRADA. */
export class ConsultarPlantilla {
  constructor(private readonly dependencias: Pick<DependenciasPlantillas, 'unidadDeTrabajo' | 'plantillas'>) {}

  async ejecutar(codigo: string, canalSolicitado: string): Promise<DetallePlantilla> {
    const canal = exigirCanalHabilitado(canalSolicitado);
    const { unidadDeTrabajo, plantillas } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const { vigente, base } = await vigenteConSuBase(plantillas, codigo, canal);
      return detalleDe(vigente, base);
    });
  }
}
