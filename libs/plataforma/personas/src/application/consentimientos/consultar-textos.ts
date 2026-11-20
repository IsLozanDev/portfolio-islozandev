import { exigirFinalidad, FINALIDADES } from '../../domain/consentimiento.js';
import type { TextoFinalidad } from '../../domain/texto-finalidad.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import { textoPublicadoDe, type TextoPublicado } from './vista-consentimiento.js';

const posicionDe = (texto: TextoFinalidad) => FINALIDADES.indexOf(texto.finalidad);

/** Textos por finalidad del tenant del contexto. */
export class ConsultarTextos {
  constructor(private readonly dependencias: Pick<DependenciasPersonas, 'unidadDeTrabajo' | 'consentimientos'>) {}

  /** Uno por finalidad publicada, el más reciente, en el orden de la lista de finalidades. */
  async vigentes(): Promise<TextoPublicado[]> {
    const { unidadDeTrabajo, consentimientos } = this.dependencias;
    const textos = await unidadDeTrabajo.run(() => consentimientos.textosVigentes());
    return [...textos].sort((uno, otro) => posicionDe(uno) - posicionDe(otro)).map(textoPublicadoDe);
  }

  /** Del más reciente al más antiguo. */
  async historial(finalidad: string): Promise<TextoPublicado[]> {
    const { unidadDeTrabajo, consentimientos } = this.dependencias;
    const textos = await unidadDeTrabajo.run(() => consentimientos.historialTextos(exigirFinalidad(finalidad)));
    return textos.map(textoPublicadoDe);
  }
}
