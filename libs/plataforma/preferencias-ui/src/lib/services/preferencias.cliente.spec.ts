import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorPreferencias, MENSAJES_PREFERENCIAS } from '../models/preferencias';
import { PreferenciasCliente } from './preferencias.cliente';

const URL_PREFERENCIAS = `${API_URL}/notificaciones/preferencias`;
const TOKEN = 'carga.firma';

describe('PreferenciasCliente', () => {
  let cliente: PreferenciasCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(PreferenciasCliente);
  });

  afterEach(() => http.verify());

  it('consultar hace POST con el token en el cuerpo, nunca en la URL', async () => {
    const respuesta = { destinoEnmascarado: 'j***@gmail.com', canal: 'CORREO', bajas: [] };
    const consulta = cliente.consultar(TOKEN);
    const peticion = http.expectOne({ method: 'POST', url: `${URL_PREFERENCIAS}/consultar` });
    expect(peticion.request.body).toEqual({ token: TOKEN });
    expect(peticion.request.urlWithParams).not.toContain(TOKEN);
    peticion.flush(respuesta);

    expect(await consulta).toEqual(respuesta);
  });

  it('darseDeBaja hace PUT con el token y el alcance y devuelve las bajas vigentes', async () => {
    const baja = cliente.darseDeBaja(TOKEN, 'CANAL');
    const peticion = http.expectOne({ method: 'PUT', url: URL_PREFERENCIAS });
    expect(peticion.request.body).toEqual({ token: TOKEN, baja: 'CANAL' });
    peticion.flush({ bajas: ['CANAL'] });

    expect(await baja).toEqual({ bajas: ['CANAL'] });
  });

  it('400 ENLACE_INVALIDO, 429 y errores sin código salen como ErrorPreferencias con su texto', async () => {
    const invalido = cliente.consultar(TOKEN);
    http.expectOne(`${URL_PREFERENCIAS}/consultar`).flush({ codigo: 'ENLACE_INVALIDO', mensaje: 'x' }, { status: 400, statusText: 'Bad Request' });
    await expect(invalido).rejects.toMatchObject({ codigo: 'ENLACE_INVALIDO', enlaceInvalido: true, message: MENSAJES_PREFERENCIAS.enlaceInvalido });

    const limitado = cliente.darseDeBaja(TOKEN, 'PROMOCIONAL');
    http.expectOne(URL_PREFERENCIAS).flush({ codigo: 'DEMASIADAS_SOLICITUDES' }, { status: 429, statusText: 'Too Many Requests' });
    await expect(limitado).rejects.toMatchObject({ codigo: 'DEMASIADAS_SOLICITUDES', message: MENSAJES_PREFERENCIAS.demasiadasSolicitudes });

    const caido = cliente.darseDeBaja(TOKEN, 'PROMOCIONAL');
    http.expectOne(URL_PREFERENCIAS).error(new ProgressEvent('error'));
    const error = await caido.catch((motivo: unknown) => motivo);
    expect(error).toBeInstanceOf(ErrorPreferencias);
    expect(error).toMatchObject({ codigo: 'DESCONOCIDO', enlaceInvalido: false, message: MENSAJES_PREFERENCIAS.desconocido });
  });
});
