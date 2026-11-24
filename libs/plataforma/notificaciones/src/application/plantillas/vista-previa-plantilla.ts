import { exigirCanalHabilitado, type CanalNotificacion } from '../../domain/canal.js';
import { validarContenido } from '../../domain/personalizacion-plantilla.js';
import type { Plantilla } from '../../domain/plantilla.js';
import { renderizar } from '../../domain/renderizador-plantilla.js';
import { valoresDeEjemplo } from '../../domain/valores-ejemplo.js';
import type { DependenciasPlantillas } from '../dependencias.js';
import { vigenteConSuBase } from './vista-plantilla.js';

/** Lo que el cliente todavía no guardó; lo que falte se toma de la vigente. */
export interface TextoVistaPrevia {
  asunto?: string;
  cuerpo?: string;
}

export interface VistaPrevia {
  asunto: string;
  cuerpoHtml: string;
}

/**
 * Renderiza con los valores de ejemplo el texto recibido (saneado y validado como al guardar) o el vigente. Solo
 * lee: no registra mensaje ni llama al proveedor.
 */
export class VistaPreviaPlantilla {
  constructor(private readonly dependencias: Pick<DependenciasPlantillas, 'unidadDeTrabajo' | 'plantillas' | 'saneador'>) {}

  async ejecutar(codigo: string, canalSolicitado: string, texto: TextoVistaPrevia): Promise<VistaPrevia> {
    const canal = exigirCanalHabilitado(canalSolicitado);
    const vigente = await this.vigente(codigo, canal);
    const contenido = {
      asunto: texto.asunto ?? vigente.asunto ?? '',
      cuerpo: texto.cuerpo === undefined ? vigente.cuerpo : this.dependencias.saneador.sanear(texto.cuerpo),
    };
    validarContenido(contenido, vigente.variables);
    const renderizado = renderizar({ ...vigente, ...contenido }, valoresDeEjemplo(vigente.variables));
    return { asunto: renderizado.asunto, cuerpoHtml: renderizado.cuerpo };
  }

  private vigente(codigo: string, canal: CanalNotificacion): Promise<Plantilla> {
    const { unidadDeTrabajo, plantillas } = this.dependencias;
    return unidadDeTrabajo.run(async () => (await vigenteConSuBase(plantillas, codigo, canal)).vigente);
  }
}
