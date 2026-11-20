import { AntivirusNoDisponibleError } from '../src/domain/errores.js';
import { AnalizadorClamav, type MedicionAntivirus, type OpcionesClamav } from '../src/infrastructure/antivirus/analizador-clamav.js';
import {
  abrirClamdFalso,
  callar,
  cerrarSinResponder,
  cortarConexion,
  puertoCerrado,
  responder,
  type ClamdFalso,
  type ReaccionClamd,
} from './support/clamd-falso.js';
import { pdf } from './support/contenidos.js';

const TROZO_BYTES = 64 * 1024;
const TIEMPO_CORTO_MS = 150;
const TIEMPOS = { tiempoConexionMs: 2_000, tiempoRespuestaMs: 2_000 };
/** TEST-NET-1 (RFC 5737): no se enruta, la conexión nunca se completa. */
const HOST_SIN_RUTA = '192.0.2.1';
const PUERTO_CLAMD = 3310;

describe('AnalizadorClamav contra un clamd falso (spec 34)', () => {
  let clamd: ClamdFalso | undefined;

  afterEach(async () => {
    await clamd?.cerrar();
    clamd = undefined;
  });

  async function analizadorCon(reaccion: ReaccionClamd, cambios: Partial<OpcionesClamav> = {}): Promise<AnalizadorClamav> {
    clamd = await abrirClamdFalso(reaccion);
    return new AnalizadorClamav({ host: clamd.host, puerto: clamd.puerto, ...TIEMPOS, ...cambios });
  }

  const codigoDe = (operacion: Promise<unknown>) =>
    operacion.then(
      () => 'no falló',
      (error: unknown) => (error instanceof AntivirusNoDisponibleError ? error.codigoOrigen : `otro error: ${String(error)}`),
    );

  it('`stream: OK` es limpio', async () => {
    const analizador = await analizadorCon(responder('stream: OK'));

    expect(await analizador.analizar(pdf())).toEqual({ limpio: true });
  });

  it('`stream: <firma> FOUND` es infectado, con la firma que devuelve clamd', async () => {
    const analizador = await analizadorCon(responder('stream: Win.Test.EICAR_HDB-1 FOUND'));

    expect(await analizador.analizar(pdf())).toEqual({ limpio: false, firma: 'Win.Test.EICAR_HDB-1' });
  });

  it('una firma más larga que el texto corto del evento se recorta a 100 caracteres', async () => {
    const analizador = await analizadorCon(responder(`stream: ${'F'.repeat(140)} FOUND`));

    expect(await analizador.analizar(pdf())).toEqual({ limpio: false, firma: 'F'.repeat(100) });
  });

  it('envía zINSTREAM, el contenido en trozos de 64 KiB con su longitud y cierra con un trozo de longitud cero', async () => {
    const analizador = await analizadorCon(responder('stream: OK'));
    const contenido = Uint8Array.from({ length: 2 * TROZO_BYTES + 1_000 }, (_valor, posicion) => posicion % 251);

    await analizador.analizar(contenido);

    const [conversacion] = (clamd as ClamdFalso).conversaciones;
    expect(conversacion.comando).toBe('zINSTREAM\0');
    expect(conversacion.trozos.map((trozo) => trozo.length)).toEqual([TROZO_BYTES, TROZO_BYTES, 1_000, 0]);
    expect(Buffer.concat(conversacion.trozos).equals(Buffer.from(contenido))).toBe(true);
  });

  it('un contenido vacío envía solo el trozo de cierre', async () => {
    const analizador = await analizadorCon(responder('stream: OK'));

    await analizador.analizar(new Uint8Array());

    expect((clamd as ClamdFalso).conversaciones[0].trozos.map((trozo) => trozo.length)).toEqual([0]);
  });

  it('`INSTREAM size limit exceeded` es un error TAMANO_EXCEDIDO, no un archivo limpio', async () => {
    const analizador = await analizadorCon(responder('INSTREAM size limit exceeded. ERROR'));

    expect(await codigoDe(analizador.analizar(pdf()))).toBe('TAMANO_EXCEDIDO');
  });

  it.each(['stream: Cannot allocate memory ERROR', 'OK', 'stream: OK y algo más', 'stream:  FOUND', 'PONG'])(
    'la respuesta «%s» es un error RESPUESTA_DESCONOCIDA',
    async (respuesta) => {
      const analizador = await analizadorCon(responder(respuesta));

      expect(await codigoDe(analizador.analizar(pdf()))).toBe('RESPUESTA_DESCONOCIDA');
    },
  );

  it('una respuesta vacía (clamd cierra sin responder) es un error RESPUESTA_DESCONOCIDA', async () => {
    const analizador = await analizadorCon(cerrarSinResponder);

    expect(await codigoDe(analizador.analizar(pdf()))).toBe('RESPUESTA_DESCONOCIDA');
  });

  it('conexión rechazada → CONEXION', async () => {
    const analizador = new AnalizadorClamav({ host: '127.0.0.1', puerto: await puertoCerrado(), ...TIEMPOS });

    expect(await codigoDe(analizador.analizar(pdf()))).toBe('CONEXION');
  });

  it('conexión cortada por clamd antes de responder → CONEXION', async () => {
    const analizador = await analizadorCon(cortarConexion);

    expect(await codigoDe(analizador.analizar(pdf()))).toBe('CONEXION');
  });

  it('sin respuesta → TIEMPO_AGOTADO al cumplirse el tiempo de respuesta, y el socket queda cerrado', async () => {
    const analizador = await analizadorCon(callar, { tiempoRespuestaMs: TIEMPO_CORTO_MS });
    const inicio = Date.now();

    expect(await codigoDe(analizador.analizar(pdf()))).toBe('TIEMPO_AGOTADO');

    expect(Date.now() - inicio).toBeGreaterThanOrEqual(TIEMPO_CORTO_MS - 10);
    await esperarCierre(clamd as ClamdFalso);
  });

  it('sin conexión → falla al cumplirse el tiempo de conexión, sin esperar el de respuesta', async () => {
    const analizador = new AnalizadorClamav({ host: HOST_SIN_RUTA, puerto: PUERTO_CLAMD, tiempoConexionMs: TIEMPO_CORTO_MS, tiempoRespuestaMs: 60_000 });
    const inicio = Date.now();

    const codigo = await codigoDe(analizador.analizar(pdf()));

    // Donde la red descarta el paquete vence el tiempo; donde responde «sin ruta», el sistema rechaza antes.
    expect(['TIEMPO_AGOTADO', 'CONEXION']).toContain(codigo);
    expect(Date.now() - inicio).toBeLessThan(TIEMPOS.tiempoRespuestaMs);
  });

  it('el error lleva solo el código: ni la respuesta de clamd ni el host', async () => {
    const analizador = await analizadorCon(responder('stream: /tmp/secreto.pdf: lstat() failed ERROR'));

    const error = await analizador.analizar(pdf()).catch((fallo: unknown) => fallo);

    expect(error).toBeInstanceOf(AntivirusNoDisponibleError);
    expect(error).toMatchObject({ code: 'ANTIVIRUS_NO_DISPONIBLE', message: 'El antivirus no respondió: RESPUESTA_DESCONOCIDA' });
  });

  describe('comprobar (PING)', () => {
    it('envía zPING y acepta PONG', async () => {
      const analizador = await analizadorCon(responder('PONG'));

      await expect(analizador.comprobar()).resolves.toBeUndefined();
      expect((clamd as ClamdFalso).conversaciones[0].comando).toBe('zPING\0');
    });

    it('otra respuesta → RESPUESTA_DESCONOCIDA', async () => {
      const analizador = await analizadorCon(responder('stream: OK'));

      expect(await codigoDe(analizador.comprobar())).toBe('RESPUESTA_DESCONOCIDA');
    });

    it('clamd caído → CONEXION', async () => {
      const analizador = new AnalizadorClamav({ host: '127.0.0.1', puerto: await puertoCerrado(), ...TIEMPOS });

      expect(await codigoDe(analizador.comprobar())).toBe('CONEXION');
    });
  });

  describe('medición para el log', () => {
    const mediciones: MedicionAntivirus[] = [];
    const alAnalizar = (medicion: MedicionAntivirus) => void mediciones.push(medicion);

    beforeEach(() => {
      mediciones.length = 0;
    });

    it('limpio e infectado: resultado, duración y bytes, sin la firma', async () => {
      const limpio = await analizadorCon(responder('stream: OK'), { alAnalizar });
      await limpio.analizar(pdf());
      await clamd?.cerrar();
      const infectado = await analizadorCon(responder('stream: Eicar-Signature FOUND'), { alAnalizar });
      await infectado.analizar(pdf());

      expect(mediciones).toEqual([
        { resultado: 'LIMPIO', duracionMs: expect.any(Number), bytes: pdf().byteLength },
        { resultado: 'INFECTADO', duracionMs: expect.any(Number), bytes: pdf().byteLength },
      ]);
    });

    it('un fallo se mide como ERROR con su código, y se relanza', async () => {
      const analizador = await analizadorCon(responder('INSTREAM size limit exceeded. ERROR'), { alAnalizar });

      expect(await codigoDe(analizador.analizar(pdf()))).toBe('TAMANO_EXCEDIDO');

      expect(mediciones).toEqual([{ resultado: 'ERROR', duracionMs: expect.any(Number), bytes: pdf().byteLength, codigoError: 'TAMANO_EXCEDIDO' }]);
    });
  });
});

async function esperarCierre(clamd: ClamdFalso): Promise<void> {
  const limite = Date.now() + TIEMPOS.tiempoRespuestaMs;
  while (!clamd.conversaciones.every((conversacion) => conversacion.cerrada)) {
    if (Date.now() > limite) throw new Error('el cliente no cerró el socket');
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
}
