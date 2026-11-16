import {
  CuerpoDecolectaInvalidoError,
  ProveedorDecolecta,
  RespuestaDecolectaError,
} from '../src/infrastructure/decolecta/proveedor.decolecta.js';
import { DNI_200, RUC_200, RUC_422 } from './support/respuestas-decolecta.js';

const TOKEN = 'token-de-prueba';

interface LlamadaGrabada {
  url: string;
  autorizacion: string | null;
  señal: AbortSignal | null | undefined;
}

function fetchGrabado(estado: number, cuerpo: unknown = {}) {
  const llamadas: LlamadaGrabada[] = [];
  const fetchFalso = (async (url: URL, opciones: RequestInit) => {
    llamadas.push({
      url: url.toString(),
      autorizacion: new Headers(opciones.headers).get('authorization'),
      señal: opciones.signal,
    });
    return new Response(JSON.stringify(cuerpo), { status: estado });
  }) as unknown as typeof fetch;
  return { llamadas, fetchFalso };
}

const proveedorCon = (fetchFalso: typeof fetch) => new ProveedorDecolecta({ token: TOKEN, fetch: fetchFalso });
const señal = () => new AbortController().signal;

describe('ProveedorDecolecta', () => {
  it('DNI: llama a /v1/reniec/dni con Bearer y mapea nombres y apellidos', async () => {
    const { llamadas, fetchFalso } = fetchGrabado(200, DNI_200);
    const señalConsulta = señal();

    const datos = await proveedorCon(fetchFalso).consultarDni('45781236', señalConsulta);

    expect(datos).toEqual({ nombres: 'JUANA', apellidos: 'QUISPE MAMANI' });
    expect(llamadas).toEqual([
      { url: 'https://api.decolecta.com/v1/reniec/dni?numero=45781236', autorizacion: `Bearer ${TOKEN}`, señal: señalConsulta },
    ]);
  });

  it('DNI sin segundo apellido no deja espacio colgando', async () => {
    const { fetchFalso } = fetchGrabado(200, { ...DNI_200, second_last_name: '' });
    await expect(proveedorCon(fetchFalso).consultarDni('45781236', señal())).resolves.toEqual({ nombres: 'JUANA', apellidos: 'QUISPE' });
  });

  it('RUC: mapea los cinco campos y no deja salir ningún otro', async () => {
    const { llamadas, fetchFalso } = fetchGrabado(200, RUC_200);

    const datos = await proveedorCon(fetchFalso).consultarRuc('20512345671', señal());

    expect(datos).toEqual({
      razonSocial: 'COMERCIAL ANDINA S.A.C.',
      estado: 'ACTIVO',
      condicion: 'HABIDO',
      direccionFiscal: 'AV. LARCO NRO. 123 MIRAFLORES LIMA LIMA',
      ubigeo: '150122',
    });
    expect(llamadas[0].url).toBe('https://api.decolecta.com/v1/sunat/ruc?numero=20512345671');
  });

  it.each([
    [404, {}],
    [422, RUC_422],
  ])('%i es «no existe»: devuelve null', async (estado, cuerpo) => {
    const { fetchFalso } = fetchGrabado(estado, cuerpo);
    await expect(proveedorCon(fetchFalso).consultarRuc('20512345671', señal())).resolves.toBeNull();
    await expect(proveedorCon(fetchFalso).consultarDni('45781236', señal())).resolves.toBeNull();
  });

  it.each([400, 401, 403, 429, 500, 503])('%i es un fallo: lanza para que pase al respaldo', async (estado) => {
    const { fetchFalso } = fetchGrabado(estado, { error: 'x' });
    await expect(proveedorCon(fetchFalso).consultarDni('45781236', señal())).rejects.toEqual(new RespuestaDecolectaError(estado));
  });

  it('un error de red se propaga', async () => {
    const fetchCaido = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(proveedorCon(fetchCaido).consultarRuc('20512345671', señal())).rejects.toThrow('fetch failed');
  });

  it('un 200 sin los campos esperados es un fallo', async () => {
    const { fetchFalso } = fetchGrabado(200, { razon_social: 'X' });
    await expect(proveedorCon(fetchFalso).consultarRuc('20512345671', señal())).rejects.toThrow(CuerpoDecolectaInvalidoError);
  });

  it('respeta la URL base configurada', async () => {
    const { llamadas, fetchFalso } = fetchGrabado(200, DNI_200);
    await new ProveedorDecolecta({ token: TOKEN, urlBase: 'https://sandbox.example', fetch: fetchFalso }).consultarDni('45781236', señal());
    expect(llamadas[0].url).toBe('https://sandbox.example/v1/reniec/dni?numero=45781236');
  });
});
