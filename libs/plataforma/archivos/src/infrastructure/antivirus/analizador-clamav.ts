import { connect, type Socket } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { AnalizadorAntivirus, ResultadoAntivirus, SaludAntivirus } from '../../application/ports/analizador-antivirus.js';
import { AntivirusNoDisponibleError, type CodigoErrorAntivirus } from '../../domain/errores.js';
import { LARGO_MAXIMO_TEXTO_CORTO } from '../event-schemas.js';

// Protocolo de clamd (docs.clamav.net/manual/Usage/ClamdProtocol.html). Con el prefijo `z` el comando y la
// respuesta terminan en un byte NUL. INSTREAM: trozos con su longitud en 4 bytes big-endian y, al final,
// un trozo de longitud cero.
const COMANDO_ANALIZAR = Buffer.from('zINSTREAM\0', 'latin1');
const COMANDO_SALUD = Buffer.from('zPING\0', 'latin1');
const TERMINADOR = 0;
const TAMANO_TROZO_BYTES = 64 * 1024;
const BYTES_DE_LONGITUD = 4;
const FIN_DE_FLUJO = Buffer.alloc(BYTES_DE_LONGITUD);
const RESPUESTA_LIMPIO = 'stream: OK';
const PATRON_INFECTADO = /^stream: (.+) FOUND$/;
const RESPUESTA_TAMANO_EXCEDIDO = 'INSTREAM size limit exceeded';
const RESPUESTA_SALUD = 'PONG';

export interface MedicionAntivirus {
  resultado: 'LIMPIO' | 'INFECTADO' | 'ERROR';
  duracionMs: number;
  bytes: number;
  codigoError?: CodigoErrorAntivirus;
}

export interface OpcionesClamav {
  host: string;
  puerto: number;
  /** Espera de la conexión TCP. */
  tiempoConexionMs: number;
  /** Espera de la respuesta, desde que conecta: cubre el envío y el escaneo. */
  tiempoRespuestaMs: number;
  /** Para el log del análisis. Nunca recibe el contenido, la firma ni la respuesta de clamd. */
  alAnalizar?: (medicion: MedicionAntivirus) => void;
}

/**
 * ClamAV por TCP (`clamd`, spec 34). Una conexión por análisis, sin sesión. Lista cerrada de respuestas: solo
 * `stream: OK` es limpio y solo `stream: <firma> FOUND` es infectado; cualquier otra cosa (clamd caído, tiempo
 * agotado, respuesta desconocida o tamaño excedido) lanza `AntivirusNoDisponibleError` y el trabajo se reintenta.
 */
export class AnalizadorClamav implements AnalizadorAntivirus, SaludAntivirus {
  constructor(private readonly opciones: OpcionesClamav) {}

  async analizar(contenido: Uint8Array): Promise<ResultadoAntivirus> {
    const inicio = Date.now();
    const medir = (medicion: Pick<MedicionAntivirus, 'resultado' | 'codigoError'>) =>
      this.opciones.alAnalizar?.({ ...medicion, duracionMs: Date.now() - inicio, bytes: contenido.byteLength });
    try {
      const resultado = interpretarAnalisis(await this.conversar(tramasDeAnalisis(contenido)));
      medir({ resultado: resultado.limpio ? 'LIMPIO' : 'INFECTADO' });
      return resultado;
    } catch (error) {
      medir({ resultado: 'ERROR', codigoError: error instanceof AntivirusNoDisponibleError ? error.codigoOrigen : undefined });
      throw error;
    }
  }

  async comprobar(): Promise<void> {
    const respuesta = await this.conversar([COMANDO_SALUD]);
    if (respuesta !== RESPUESTA_SALUD) throw new AntivirusNoDisponibleError('RESPUESTA_DESCONOCIDA');
  }

  /** Abre la conexión, envía las tramas y devuelve la respuesta hasta el NUL o el cierre. Siempre cierra el socket. */
  private conversar(tramas: Iterable<Uint8Array>): Promise<string> {
    const { host, puerto, tiempoConexionMs, tiempoRespuestaMs } = this.opciones;
    return new Promise((resolver, rechazar) => {
      const socket = connect({ host, port: puerto });
      const recibido: Buffer[] = [];
      let terminado = false;
      const terminar = (concluir: () => void) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(limite);
        socket.destroy();
        concluir();
      };
      const fallar = (codigo: CodigoErrorAntivirus) => terminar(() => rechazar(new AntivirusNoDisponibleError(codigo)));
      const responder = () => terminar(() => resolver(textoDeRespuesta(recibido)));
      let limite = setTimeout(() => fallar('TIEMPO_AGOTADO'), tiempoConexionMs);

      socket.once('connect', () => {
        clearTimeout(limite);
        limite = setTimeout(() => fallar('TIEMPO_AGOTADO'), tiempoRespuestaMs);
        enviar(socket, tramas);
      });
      socket.on('data', (trozo: Buffer) => {
        recibido.push(trozo);
        if (trozo.includes(TERMINADOR)) responder();
      });
      socket.once('end', responder);
      // clamd corta la conexión al pasar su límite de tamaño: si ya respondió, vale su respuesta.
      socket.once('error', () => (recibido.length > 0 ? responder() : fallar('CONEXION')));
    });
  }
}

/** Respeta la contrapresión del socket y no lo cierra: la respuesta llega por la misma conexión. */
function enviar(socket: Socket, tramas: Iterable<Uint8Array>): void {
  // Un fallo de escritura llega también como `error` del socket, que es quien decide el resultado.
  pipeline(Readable.from(tramas), socket, { end: false }).catch(() => undefined);
}

/** Los trozos son vistas del mismo contenido: el archivo no se copia. */
function* tramasDeAnalisis(contenido: Uint8Array): Generator<Uint8Array> {
  yield COMANDO_ANALIZAR;
  for (let inicio = 0; inicio < contenido.byteLength; inicio += TAMANO_TROZO_BYTES) {
    const trozo = contenido.subarray(inicio, inicio + TAMANO_TROZO_BYTES);
    yield longitudEnOrdenDeRed(trozo.byteLength);
    yield trozo;
  }
  yield FIN_DE_FLUJO;
}

function longitudEnOrdenDeRed(longitud: number): Buffer {
  const cabecera = Buffer.alloc(BYTES_DE_LONGITUD);
  cabecera.writeUInt32BE(longitud);
  return cabecera;
}

function textoDeRespuesta(recibido: Buffer[]): string {
  const respuesta = Buffer.concat(recibido);
  const fin = respuesta.indexOf(TERMINADOR);
  return respuesta.toString('utf8', 0, fin >= 0 ? fin : respuesta.length).trim();
}

function interpretarAnalisis(respuesta: string): ResultadoAntivirus {
  if (respuesta === RESPUESTA_LIMPIO) return { limpio: true };
  const firma = PATRON_INFECTADO.exec(respuesta)?.[1];
  if (firma) return { limpio: false, firma: firma.slice(0, LARGO_MAXIMO_TEXTO_CORTO) };
  throw new AntivirusNoDisponibleError(respuesta.startsWith(RESPUESTA_TAMANO_EXCEDIDO) ? 'TAMANO_EXCEDIDO' : 'RESPUESTA_DESCONOCIDA');
}
