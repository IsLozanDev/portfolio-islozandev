import { AnalizadorClamav } from '../src/infrastructure/antivirus/analizador-clamav.js';
import { describeConClamav, OPCIONES_CLAMAV } from './support/clamav.js';
import { pdf, texto } from './support/contenidos.js';

// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
/** El máximo del bucket y de las categorías (01m_arc): clamd debe admitirlo con StreamMaxLength 30M. */
const VEINTICINCO_MEGABYTES = 26_214_400;
const ESPERA_ARCHIVO_GRANDE_MS = 90_000;

describeConClamav('AnalizadorClamav contra clamd real (spec 34, TR-RNF-114)', () => {
  const analizador = new AnalizadorClamav(OPCIONES_CLAMAV);

  it('responde al PING', async () => {
    await expect(analizador.comprobar()).resolves.toBeUndefined();
  });

  it('TR-CA-201: la cadena EICAR sale infectada, con la firma de ClamAV', async () => {
    const resultado = await analizador.analizar(texto(CADENA_EICAR));

    // El nombre exacto cambia entre versiones de las firmas.
    expect(resultado).toEqual({ limpio: false, firma: expect.stringMatching(/EICAR/i) });
  });

  it('un PDF limpio sale limpio', async () => {
    expect(await analizador.analizar(pdf())).toEqual({ limpio: true });
  });

  it(
    'un archivo de 25 MB se analiza sin pasar el límite de tamaño',
    async () => {
      const contenido = new Uint8Array(VEINTICINCO_MEGABYTES);
      contenido.set(pdf());

      expect(await analizador.analizar(contenido)).toEqual({ limpio: true });
    },
    ESPERA_ARCHIVO_GRANDE_MS,
  );
});
