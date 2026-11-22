import { TextoFinalidad } from '../../domain/texto-finalidad.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import { exigirUsuario } from './exigencias.js';
import { textoPublicadoDe, type TextoPublicado } from './vista-consentimiento.js';

export const ACCION_PUBLICAR_TEXTO = 'plat.persona.texto_finalidad.publicar';
const ENTIDAD_AUDITADA = 'texto_finalidad';

export interface PublicarTextoComando {
  finalidad: string;
  version: string;
  texto: string;
}

/** Publica una versión del texto de una finalidad, vigente desde ya. Se audita sin el texto. */
export class PublicarTextoFinalidad {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  ejecutar(comando: PublicarTextoComando): Promise<TextoPublicado> {
    const { unidadDeTrabajo, reloj, ids, contexto, consentimientos, auditoria } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const texto = TextoFinalidad.publicar({ ...comando, id: ids.next(), publicadoPor: exigirUsuario(contexto), publicadoEn: reloj.now() });
      await consentimientos.publicarTexto(texto);
      await auditoria.registrar({
        accion: ACCION_PUBLICAR_TEXTO,
        entidadTipo: ENTIDAD_AUDITADA,
        entidadId: texto.datos.id,
        despues: { finalidad: texto.finalidad, version: texto.version },
      });
      return textoPublicadoDe(texto);
    });
  }
}
