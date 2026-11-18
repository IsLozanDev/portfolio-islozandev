import { AlmacenArchivosMemoria, UrlFirmadaRechazadaError } from '../src/infrastructure/memoria/almacen-archivos.memoria.js';
import { pdf, png } from './support/contenidos.js';
import { RelojFijo } from './support/reloj-fijo.js';

const RUTA = '33000000-0000-4000-8000-00000000000a/33000000-0000-4000-8000-0000000000a1/1';
const AHORA = '2026-11-18T15:00:00.000Z';
const VIGENCIA_MAXIMA_SEGUNDOS = 900;

describe('AlmacenArchivosMemoria', () => {
  let reloj: RelojFijo;
  let almacen: AlmacenArchivosMemoria;

  const rechazo = (accion: () => unknown) => {
    try {
      accion();
    } catch (error) {
      return error instanceof UrlFirmadaRechazadaError ? error.motivo : error;
    }
    return 'ACEPTADA';
  };

  beforeEach(() => {
    reloj = new RelojFijo(AHORA);
    almacen = new AlmacenArchivosMemoria(reloj);
  });

  it('firma una carga de 2 horas y el cliente sube con esa URL', async () => {
    const carga = await almacen.firmarCarga(RUTA);

    almacen.subirConUrl(carga.url, pdf());

    expect(carga.expiraEn).toEqual(new Date('2026-11-18T17:00:00.000Z'));
    expect(carga.url).toContain(carga.token);
    expect(await almacen.leer(RUTA)).toEqual(pdf());
  });

  it('una segunda subida a la misma URL no reemplaza el objeto', async () => {
    const carga = await almacen.firmarCarga(RUTA);
    almacen.subirConUrl(carga.url, pdf());

    expect(rechazo(() => almacen.subirConUrl(carga.url, png()))).toBe('OBJETO_YA_EXISTE');
    expect(await almacen.leer(RUTA)).toEqual(pdf());
  });

  it('la URL de carga deja de valer a las 2 horas', async () => {
    const carga = await almacen.firmarCarga(RUTA);
    reloj.adelantarMinutos(120);

    expect(rechazo(() => almacen.subirConUrl(carga.url, pdf()))).toBe('EXPIRADA');
    expect(almacen.existe(RUTA)).toBe(false);
  });

  it('la URL de descarga sirve dentro de su vigencia y se rechaza 16 minutos después (TR-CA-206)', async () => {
    const carga = await almacen.firmarCarga(RUTA);
    almacen.subirConUrl(carga.url, pdf());
    const url = await almacen.firmarDescarga(RUTA, VIGENCIA_MAXIMA_SEGUNDOS);

    reloj.adelantarMinutos(14);
    expect(almacen.descargarConUrl(url)).toEqual(pdf());
    reloj.adelantarMinutos(2);
    expect(rechazo(() => almacen.descargarConUrl(url))).toBe('EXPIRADA');
  });

  it('la URL lleva el nombre de descarga solo cuando se pide', async () => {
    const comoAdjunto = await almacen.firmarDescarga(RUTA, VIGENCIA_MAXIMA_SEGUNDOS, 'contrato.pdf');
    const enLinea = await almacen.firmarDescarga(RUTA, VIGENCIA_MAXIMA_SEGUNDOS);

    expect(new URL(comoAdjunto).searchParams.get('download')).toBe('contrato.pdf');
    expect(new URL(enLinea).searchParams.has('download')).toBe(false);
  });

  it('una URL de carga no sirve para descargar, ni una inventada para nada', async () => {
    const carga = await almacen.firmarCarga(RUTA);
    almacen.subirConUrl(carga.url, pdf());

    expect(rechazo(() => almacen.descargarConUrl(carga.url))).toBe('FIRMA_INVALIDA');
    expect(rechazo(() => almacen.descargarConUrl(`https://almacen.memoria/descarga/${RUTA}?token=inventado`))).toBe('FIRMA_INVALIDA');
    expect(rechazo(() => almacen.descargarConUrl(`https://almacen.memoria/descarga/${RUTA}`))).toBe('FIRMA_INVALIDA');
  });

  it('leer un objeto que no existe da nulo y borrarlo no falla', async () => {
    expect(await almacen.leer(RUTA)).toBeNull();
    await expect(almacen.borrar(RUTA)).resolves.toBeUndefined();
  });

  it('borrar quita el objeto y su URL de descarga deja de servir', async () => {
    const carga = await almacen.firmarCarga(RUTA);
    almacen.subirConUrl(carga.url, pdf());
    const url = await almacen.firmarDescarga(RUTA, VIGENCIA_MAXIMA_SEGUNDOS);

    await almacen.borrar(RUTA);

    expect(almacen.existe(RUTA)).toBe(false);
    expect(rechazo(() => almacen.descargarConUrl(url))).toBe('OBJETO_NO_EXISTE');
  });
});
