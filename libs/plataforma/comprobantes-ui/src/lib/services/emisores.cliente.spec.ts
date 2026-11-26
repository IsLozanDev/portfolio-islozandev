import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EMPRESA_ID, emisorDePrueba, respuestaEmisorDePrueba } from '../../testing/emisor-de-prueba';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorFe } from '../models/error-fe';
import { EmisoresCliente } from './emisores.cliente';

const URL_EMISORES = `${API_URL}/fe/emisores`;
const URL_EMISOR = `${URL_EMISORES}/${EMPRESA_ID}`;

describe('EmisoresCliente', () => {
  let cliente: EmisoresCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(EmisoresCliente);
  });

  afterEach(() => http.verify());

  it('listar mapea las empresas con su resumen o null', async () => {
    const lista = cliente.listar();
    http.expectOne({ method: 'GET', url: URL_EMISORES }).flush([{ empresa_id: EMPRESA_ID, ruc: '20601234561', razon_social: 'ANDES SAC', emisor: null }]);
    expect(await lista).toEqual([{ empresaId: EMPRESA_ID, ruc: '20601234561', razonSocial: 'ANDES SAC', emisor: null }]);
  });

  it('obtener: el emisor en camelCase; 404 → null; otro error → ErrorFe con su texto', async () => {
    const encontrado = cliente.obtener(EMPRESA_ID);
    http.expectOne({ method: 'GET', url: URL_EMISOR }).flush(respuestaEmisorDePrueba());
    expect(await encontrado).toEqual(emisorDePrueba());

    const sinEmisor = cliente.obtener(EMPRESA_ID);
    http.expectOne(URL_EMISOR).flush({ codigo: 'EMISOR_NO_ENCONTRADO', mensaje: 'x' }, { status: 404, statusText: 'Not Found' });
    expect(await sinEmisor).toBeNull();

    const prohibido = cliente.obtener(EMPRESA_ID);
    http.expectOne(URL_EMISOR).flush({ codigo: 'SIN_PERMISO', mensaje: 'x' }, { status: 403, statusText: 'Forbidden' });
    await expect(prohibido).rejects.toMatchObject({ codigo: 'SIN_PERMISO', estado: 403 });
  });

  it('configurar hace PUT con la carga; 409 VERSION_OBSOLETA sale con su mensaje en español', async () => {
    const carga = { proveedor: 'SUNAT', usuario_proveedor: 'MODDATOS', regimen_igv: 'GENERAL' as const, leyenda_pie: null, version: 3 };
    const configurado = cliente.configurar(EMPRESA_ID, carga);
    const peticion = http.expectOne({ method: 'PUT', url: URL_EMISOR });
    expect(peticion.request.body).toEqual(carga);
    peticion.flush(respuestaEmisorDePrueba({ version: 4 }));
    expect((await configurado).version).toBe(4);

    const obsoleto = cliente.configurar(EMPRESA_ID, carga);
    http.expectOne(URL_EMISOR).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'x' }, { status: 409, statusText: 'Conflict' });
    const error = await obsoleto.catch((motivo: unknown) => motivo);
    expect(error).toBeInstanceOf(ErrorFe);
    expect((error as ErrorFe).message).toBe('Otro usuario cambió el emisor. Se recargaron los datos.');
  });

  it('cargarCertificado manda multipart con archivo y clave; 413 → «El archivo supera los 50 KB.»', async () => {
    const archivo = new File([new Uint8Array([1, 2, 3])], 'empresa.pfx');
    const cargado = cliente.cargarCertificado(EMPRESA_ID, archivo, 'clave-pfx');
    const peticion = http.expectOne({ method: 'POST', url: `${URL_EMISOR}/certificado` });
    const cuerpo = peticion.request.body as FormData;
    expect(cuerpo.get('archivo')).toBeInstanceOf(File);
    expect(cuerpo.get('clave')).toBe('clave-pfx');
    peticion.flush(respuestaEmisorDePrueba());
    await cargado;

    const grande = cliente.cargarCertificado(EMPRESA_ID, archivo, 'clave-pfx');
    http.expectOne(`${URL_EMISOR}/certificado`).flush(null, { status: 413, statusText: 'Payload Too Large' });
    await expect(grande).rejects.toMatchObject({ codigo: 'ARCHIVO_DEMASIADO_GRANDE', message: 'El archivo supera los 50 KB.' });
  });

  it('solicitarPrueba y pasarAProduccion hacen POST a sus rutas', async () => {
    const prueba = cliente.solicitarPrueba(EMPRESA_ID);
    http.expectOne({ method: 'POST', url: `${URL_EMISOR}/prueba` }).flush(respuestaEmisorDePrueba(), { status: 202, statusText: 'Accepted' });
    await prueba;
    const produccion = cliente.pasarAProduccion(EMPRESA_ID);
    http
      .expectOne({ method: 'POST', url: `${URL_EMISOR}/produccion` })
      .flush({ codigo: 'PROVEEDOR_SIMULADO_EN_PRODUCCION', mensaje: 'x' }, { status: 409, statusText: 'Conflict' });
    await expect(produccion).rejects.toMatchObject({ message: 'El simulador no puede pasar a producción.' });
  });
});
