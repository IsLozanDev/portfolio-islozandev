import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';

const HOST_LOCAL = '127.0.0.1';
const BYTES_DE_LONGITUD = 4;
const TERMINADOR = 0;

/** Lo que el servidor falso recibió en una conexión. */
export interface ConversacionClamd {
  comando: string;
  /** Trozos de INSTREAM en orden, sin sus 4 bytes de longitud. El último, de longitud cero, cierra el flujo. */
  trozos: Buffer[];
  cerrada: boolean;
}

/** Qué hace el servidor con la conexión cuando ya recibió el comando completo (y el flujo, si es INSTREAM). */
export type ReaccionClamd = (socket: Socket) => void;

export const responder = (respuesta: string): ReaccionClamd => (socket) => socket.end(`${respuesta}\0`);
export const cerrarSinResponder: ReaccionClamd = (socket) => socket.end();
export const cortarConexion: ReaccionClamd = (socket) => socket.resetAndDestroy();
export const callar: ReaccionClamd = () => undefined;

export interface ClamdFalso {
  host: string;
  puerto: number;
  conversaciones: ConversacionClamd[];
  cerrar(): Promise<void>;
}

/** Servidor TCP que habla lo justo del protocolo de clamd (`zINSTREAM` y `zPING`) para probar el adaptador sin ClamAV. */
export async function abrirClamdFalso(reaccion: ReaccionClamd): Promise<ClamdFalso> {
  const conversaciones: ConversacionClamd[] = [];
  const sockets = new Set<Socket>();
  const servidor = createServer((socket) => {
    const conversacion: ConversacionClamd = { comando: '', trozos: [], cerrada: false };
    conversaciones.push(conversacion);
    sockets.add(socket);
    let recibido = Buffer.alloc(0);
    let atendida = false;
    socket.on('data', (datos: Buffer) => {
      recibido = Buffer.concat([recibido, datos]);
      if (atendida || !leerConversacion(recibido, conversacion)) return;
      atendida = true;
      reaccion(socket);
    });
    socket.on('error', () => undefined);
    socket.on('close', () => {
      conversacion.cerrada = true;
      sockets.delete(socket);
    });
  });
  await escuchar(servidor);
  return {
    host: HOST_LOCAL,
    puerto: (servidor.address() as AddressInfo).port,
    conversaciones,
    cerrar: () => {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolver) => servidor.close(() => resolver()));
    },
  };
}

/** Un puerto local donde nadie escucha: el servidor se abre para reservarlo y se cierra. */
export async function puertoCerrado(): Promise<number> {
  const clamd = await abrirClamdFalso(callar);
  await clamd.cerrar();
  return clamd.puerto;
}

function escuchar(servidor: Server): Promise<void> {
  return new Promise((resolver) => servidor.listen(0, HOST_LOCAL, resolver));
}

/** `true` cuando el comando llegó entero: hasta el NUL, y en INSTREAM hasta el trozo de longitud cero. */
function leerConversacion(recibido: Buffer, conversacion: ConversacionClamd): boolean {
  const finComando = recibido.indexOf(TERMINADOR);
  if (finComando < 0) return false;
  conversacion.comando = recibido.toString('latin1', 0, finComando + 1);
  if (!conversacion.comando.startsWith('zINSTREAM')) return true;
  conversacion.trozos = [];
  let posicion = finComando + 1;
  while (posicion + BYTES_DE_LONGITUD <= recibido.length) {
    const longitud = recibido.readUInt32BE(posicion);
    const finTrozo = posicion + BYTES_DE_LONGITUD + longitud;
    if (finTrozo > recibido.length) return false;
    conversacion.trozos.push(recibido.subarray(posicion + BYTES_DE_LONGITUD, finTrozo));
    if (longitud === 0) return true;
    posicion = finTrozo;
  }
  return false;
}
