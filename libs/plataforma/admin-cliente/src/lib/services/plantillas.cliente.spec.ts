import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ContenidoPlantillaInvalidoError, VariableNoPermitidaError, VersionObsoletaPlantillaError } from '../models/errores-plantilla';
import type { DetallePlantillaRespuesta } from '../models/plantilla';
import { PlantillasCliente } from './plantillas.cliente';

const URL_PLANTILLAS = `${API_URL}/notificaciones/plantillas`;
const URL_SUSCRIPCION = `${URL_PLANTILLAS}/SUSCRIPCION_POR_VENCER/CORREO`;

const DETALLE: DetallePlantillaRespuesta = {
  codigo: 'SUSCRIPCION_POR_VENCER',
  nombre: 'Aviso de suscripción por vencer',
  canal: 'CORREO',
  idioma: 'es',
  origen: 'PERSONALIZADA',
  asunto: 'Vence en {{dias}} días',
  cuerpo: '<p>Hola {{tenant}}</p>',
  variables: [{ nombre: 'tenant', tipo: 'texto', ejemplo: 'Restaurante' }],
  version: 2,
  actualizado_en: '2026-11-27T15:00:00.000Z',
  base: { asunto: null, cuerpo: '<p>Base</p>' },
};

describe('PlantillasCliente', () => {
  let cliente: PlantillasCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(PlantillasCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET con q, pagina y tamano y mapea; la base sale sin versión', async () => {
    const respuesta = cliente.listar({ q: 'vencer', pagina: 1, tamano: 25 });

    const resumen = { codigo: 'PRUEBA_CORREO', nombre: 'Correo de prueba', canal: 'CORREO', idioma: 'es', asunto: 'Prueba', actualizado_en: 'x' };
    http
      .expectOne((peticion) => peticion.url === URL_PLANTILLAS && peticion.params.toString() === 'pagina=1&tamano=25&q=vencer')
      .flush({
        items: [
          { ...resumen, origen: 'BASE', version: 1 },
          { ...resumen, codigo: 'TENANT_SUSPENDIDO', origen: 'PERSONALIZADA', version: 3, asunto: null },
        ],
        total: 2,
        pagina: 1,
        tamano: 25,
      });

    const pagina = await respuesta;
    expect(pagina.total).toBe(2);
    expect(pagina.items[0]).toEqual({
      codigo: 'PRUEBA_CORREO',
      nombre: 'Correo de prueba',
      canal: 'CORREO',
      idioma: 'es',
      origen: 'BASE',
      version: null,
      asunto: 'Prueba',
      actualizadoEn: 'x',
    });
    expect(pagina.items[1]).toMatchObject({ origen: 'PERSONALIZADA', version: 3, asunto: '' });
  });

  it('listar sin texto no manda q', async () => {
    const respuesta = cliente.listar({ q: '', pagina: 2, tamano: 10 });

    http.expectOne(`${URL_PLANTILLAS}?pagina=2&tamano=10`).flush({ items: [], total: 0, pagina: 2, tamano: 10 });

    await expect(respuesta).resolves.toEqual({ items: [], total: 0 });
  });

  it('obtener mapea a camelCase y el asunto nulo de la base a vacío', async () => {
    const respuesta = cliente.obtener('SUSCRIPCION_POR_VENCER', 'CORREO');

    http.expectOne(URL_SUSCRIPCION).flush(DETALLE);

    await expect(respuesta).resolves.toMatchObject({
      nombre: 'Aviso de suscripción por vencer',
      version: 2,
      actualizadoEn: '2026-11-27T15:00:00.000Z',
      variables: [{ nombre: 'tenant', tipo: 'texto', ejemplo: 'Restaurante' }],
      base: { asunto: '', cuerpo: '<p>Base</p>' },
    });
  });

  it('versiones pide GET .../versiones y mapea', async () => {
    const respuesta = cliente.versiones('SUSCRIPCION_POR_VENCER', 'CORREO');

    http.expectOne(`${URL_SUSCRIPCION}/versiones`).flush([{ version: 2, activa: true, creado_por: 'u1', creado_en: 'f' }]);

    await expect(respuesta).resolves.toEqual([{ version: 2, activa: true, creadoPor: 'u1', creadoEn: 'f' }]);
  });

  it('vistaPrevia hace POST con el texto y mapea cuerpo_html', async () => {
    const respuesta = cliente.vistaPrevia('SUSCRIPCION_POR_VENCER', 'CORREO', { cuerpo: '<p>{{tenant}}</p>' });

    const peticion = http.expectOne(`${URL_SUSCRIPCION}/vista-previa`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ cuerpo: '<p>{{tenant}}</p>' });
    peticion.flush({ asunto: 'Vence en 3 días', cuerpo_html: '<p>Restaurante</p>' });

    await expect(respuesta).resolves.toEqual({ asunto: 'Vence en 3 días', cuerpoHtml: '<p>Restaurante</p>' });
  });

  it('guardar hace PUT con asunto, cuerpo y versión y devuelve el detalle saneado', async () => {
    const respuesta = cliente.guardar('SUSCRIPCION_POR_VENCER', 'CORREO', { asunto: 'A', cuerpo: '<p onclick="x">B</p>', version: null });

    const peticion = http.expectOne(URL_SUSCRIPCION);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ asunto: 'A', cuerpo: '<p onclick="x">B</p>', version: null });
    peticion.flush({ ...DETALLE, cuerpo: '<p>B</p>' });

    await expect(respuesta).resolves.toMatchObject({ cuerpo: '<p>B</p>' });
  });

  it('TR-CA-185: el 400 VARIABLE_NO_PERMITIDA sale con los nombres', async () => {
    const respuesta = cliente.guardar('SUSCRIPCION_POR_VENCER', 'CORREO', { asunto: 'A', cuerpo: '{{diagnostico}}', version: null });

    http
      .expectOne(URL_SUSCRIPCION)
      .flush(
        { codigo: 'VARIABLE_NO_PERMITIDA', mensaje: 'Variable no permitida: diagnostico', variables: ['diagnostico'] },
        { status: 400, statusText: 'Bad Request' },
      );

    const error = await respuesta.catch((motivo: unknown) => motivo);
    expect(error).toBeInstanceOf(VariableNoPermitidaError);
    expect(error).toMatchObject({ codigo: 'VARIABLE_NO_PERMITIDA', variables: ['diagnostico'] });
  });

  it('CONTENIDO_PLANTILLA_INVALIDO del asunto o del cuerpo sale con su campo', async () => {
    const delAsunto = cliente.vistaPrevia('SUSCRIPCION_POR_VENCER', 'CORREO', { asunto: 'Dos\nlíneas' });
    http
      .expectOne(`${URL_SUSCRIPCION}/vista-previa`)
      .flush({ codigo: 'CONTENIDO_PLANTILLA_INVALIDO', mensaje: 'El asunto debe ir en una sola línea' }, { status: 400, statusText: 'Bad Request' });
    const delCuerpo = cliente.guardar('SUSCRIPCION_POR_VENCER', 'CORREO', { asunto: 'A', cuerpo: ' ', version: null });
    http
      .expectOne(URL_SUSCRIPCION)
      .flush({ codigo: 'CONTENIDO_PLANTILLA_INVALIDO', mensaje: 'El cuerpo es obligatorio' }, { status: 400, statusText: 'Bad Request' });

    const errorAsunto = await delAsunto.catch((motivo: unknown) => motivo);
    const errorCuerpo = await delCuerpo.catch((motivo: unknown) => motivo);
    expect(errorAsunto).toBeInstanceOf(ContenidoPlantillaInvalidoError);
    expect(errorAsunto).toMatchObject({ campo: 'asunto', message: 'El asunto debe ir en una sola línea' });
    expect(errorCuerpo).toMatchObject({ campo: 'cuerpo' });
  });

  it('el 409 VERSION_OBSOLETA sale como VersionObsoletaPlantillaError', async () => {
    const respuesta = cliente.guardar('SUSCRIPCION_POR_VENCER', 'CORREO', { asunto: 'A', cuerpo: 'B', version: 1 });

    http.expectOne(URL_SUSCRIPCION).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'La plantilla cambió' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toBeInstanceOf(VersionObsoletaPlantillaError);
  });

  it('restaurarBase hace DELETE .../personalizacion; SIN_PERSONALIZACION sale como ErrorAdmin', async () => {
    const restaurada = cliente.restaurarBase('SUSCRIPCION_POR_VENCER', 'CORREO');
    const peticion = http.expectOne(`${URL_SUSCRIPCION}/personalizacion`);
    expect(peticion.request.method).toBe('DELETE');
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await expect(restaurada).resolves.toBeUndefined();

    const sinPersonalizacion = cliente.restaurarBase('SUSCRIPCION_POR_VENCER', 'CORREO');
    http
      .expectOne(`${URL_SUSCRIPCION}/personalizacion`)
      .flush({ codigo: 'SIN_PERSONALIZACION', mensaje: 'No hay personalización' }, { status: 404, statusText: 'Not Found' });
    await expect(sinPersonalizacion).rejects.toMatchObject({ codigo: 'SIN_PERSONALIZACION', estado: 404 });
  });
});
