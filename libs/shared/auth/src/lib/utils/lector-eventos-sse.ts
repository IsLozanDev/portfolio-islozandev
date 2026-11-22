/** Un evento de `text/event-stream`: su nombre (`message` si no trae `event:`) y sus datos sin parsear. */
export interface EventoSse {
  evento: string;
  datos: string;
}

/** Lo leído de un fragmento: los eventos completos y el texto que queda esperando el resto del evento. */
export interface LecturaEventosSse {
  eventos: EventoSse[];
  pendiente: string;
}

const FIN_DE_EVENTO = '\n\n';
const SALTO = '\n';
const RETORNO = '\r';
const SALTOS_DE_LINEA = /\r\n?/g;
const CAMPO_EVENTO = 'event:';
const CAMPO_DATOS = 'data:';
const EVENTO_POR_DEFECTO = 'message';

/**
 * Parsea `text/event-stream` por fragmentos. Un evento termina en una línea en blanco; los comentarios
 * (`: ping`) y los bloques sin `data:` se descartan. `pendiente` es lo que devolvió la llamada anterior
 * ('' la primera vez).
 */
export function lectorEventosSse(pendiente: string, fragmento: string): LecturaEventosSse {
  const texto = pendiente + fragmento;
  // Un `\r` al final puede ser la mitad de un `\r\n` que sigue en el próximo fragmento.
  const retornoAlFinal = texto.endsWith(RETORNO) ? RETORNO : '';
  const normalizado = texto.slice(0, texto.length - retornoAlFinal.length).replace(SALTOS_DE_LINEA, SALTO);
  const bloques = normalizado.split(FIN_DE_EVENTO);
  const incompleto = bloques.pop() ?? '';
  return {
    eventos: bloques.map(eventoDelBloque).filter((evento) => evento !== null),
    pendiente: incompleto + retornoAlFinal,
  };
}

function eventoDelBloque(bloque: string): EventoSse | null {
  const lineas = bloque.split(SALTO);
  const datos = valoresDe(lineas, CAMPO_DATOS);
  if (datos.length === 0) return null;
  return { evento: valoresDe(lineas, CAMPO_EVENTO).at(-1) ?? EVENTO_POR_DEFECTO, datos: datos.join(SALTO) };
}

function valoresDe(lineas: string[], campo: string): string[] {
  return lineas.filter((linea) => linea.startsWith(campo)).map((linea) => linea.slice(campo.length).trimStart());
}
