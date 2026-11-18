import { AnalizadorFirmaEicar, NOMBRE_FIRMA_EICAR } from '../src/infrastructure/antivirus/analizador-firma-eicar.js';
import { pdf, texto } from './support/contenidos.js';

// Partida en dos para que el antivirus de la máquina no ponga este archivo en cuarentena.
const CADENA_EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD', '-ANTIVIRUS-TEST-FILE!$H+H*'].join('');

describe('AnalizadorFirmaEicar', () => {
  const analizador = new AnalizadorFirmaEicar();

  it('detecta la cadena de prueba EICAR (TR-CA-201)', async () => {
    expect(await analizador.analizar(texto(CADENA_EICAR))).toEqual({ limpio: false, firma: NOMBRE_FIRMA_EICAR });
  });

  it('la detecta dentro de otro contenido, como un PDF', async () => {
    const pdfInfectado = Uint8Array.from([...pdf(), ...texto(CADENA_EICAR)]);

    expect(await analizador.analizar(pdfInfectado)).toEqual({ limpio: false, firma: NOMBRE_FIRMA_EICAR });
  });

  it('la detecta en una vista parcial de un búfer mayor', async () => {
    const bufer = Uint8Array.from([...texto('relleno'), ...texto(CADENA_EICAR), ...texto('relleno')]);
    const soloLaCadena = bufer.subarray(7, 7 + CADENA_EICAR.length);
    const sinLaCadena = bufer.subarray(0, 7);

    expect((await analizador.analizar(soloLaCadena)).limpio).toBe(false);
    expect((await analizador.analizar(sinLaCadena)).limpio).toBe(true);
  });

  it('cualquier otro contenido es limpio', async () => {
    expect(await analizador.analizar(pdf())).toEqual({ limpio: true });
    expect(await analizador.analizar(texto(CADENA_EICAR.slice(0, -1)))).toEqual({ limpio: true });
    expect(await analizador.analizar(new Uint8Array())).toEqual({ limpio: true });
  });
});
