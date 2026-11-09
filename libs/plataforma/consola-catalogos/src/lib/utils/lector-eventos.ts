import { aAvisoImportacion, type AvisoImportacion, type AvisoImportacionRespuesta } from '../models/importacion';

/** Lo leído de un fragmento: los avisos completos y el texto que queda esperando el resto del evento. */
export interface LecturaEventos {
  avisos: AvisoImportacion[];
  pendiente: string;
}

const FIN_DE_EVENTO = '\n\n';
const SALTO = '\n';
const RETORNO = '\r';
const SALTOS_DE_LINEA = /\r\n?/g;
const CAMPO_DATOS = 'data:';

/**
 * Parsea `text/event-stream` por fragmentos. Un evento termina en una línea en blanco; los comentarios
 * (`: ping`) se descartan. `pendiente` es lo que devolvió la llamada anterior ('' la primera vez).
 */
export function lectorEventos(pendiente: string, fragmento: string): LecturaEventos {
  const texto = pendiente + fragmento;
  // Un `\r` al final puede ser la mitad de un `\r\n` que sigue en el próximo fragmento.
  const retornoAlFinal = texto.endsWith(RETORNO) ? RETORNO : '';
  const normalizado = texto.slice(0, texto.length - retornoAlFinal.length).replace(SALTOS_DE_LINEA, SALTO);
  const bloques = normalizado.split(FIN_DE_EVENTO);
  const incompleto = bloques.pop() ?? '';
  return {
    avisos: bloques.map(datosDelBloque).filter((datos) => datos !== null).map(parsearAviso),
    pendiente: incompleto + retornoAlFinal,
  };
}

/** Las líneas `data:` del bloque unidas; null si el bloque no trae datos (solo comentarios o `event:`). */
function datosDelBloque(bloque: string): string | null {
  const datos = bloque
    .split(SALTO)
    .filter((linea) => linea.startsWith(CAMPO_DATOS))
    .map((linea) => linea.slice(CAMPO_DATOS.length).trimStart());
  return datos.length === 0 ? null : datos.join(SALTO);
}

function parsearAviso(datos: string): AvisoImportacion {
  return aAvisoImportacion(JSON.parse(datos) as AvisoImportacionRespuesta);
}
