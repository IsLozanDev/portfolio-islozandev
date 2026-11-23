import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { ErrorPersonas } from '../models/error-personas';
import { PersonasCliente } from './personas.cliente';

const ID = 'per-1';
const URL_PERSONAS = `${API_URL}/personas`;
const PERSONA = {
  id: ID,
  tipo_persona: 'NATURAL',
  tipo_documento: 'DNI',
  numero_documento: '45781236',
  nombres: 'Juana',
  apellido_paterno: 'Quispe',
  apellido_materno: 'Mamani',
  razon_social: null,
  activo: true,
};
const DETALLE = {
  ...PERSONA,
  version: 3,
  roles: [{ producto_codigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null }],
  contactos: [{ id: 'c1', tipo: 'CELULAR', valor: '987654321', principal: true }],
  direcciones: [],
};
const RESUMEN_FRONT = {
  id: ID,
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  razonSocial: null,
  activo: true,
};

describe('PersonasCliente', () => {
  let cliente: PersonasCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(PersonasCliente);
  });

  afterEach(() => http.verify());

  it('listar manda solo los criterios con valor y mapea los ítems', async () => {
    const promesa = cliente.listar({ q: ' quispe ', producto: 'CLI', rol: undefined, pagina: 2, tamano: 20 });
    const peticion = http.expectOne((solicitud) => solicitud.url === URL_PERSONAS);
    expect(peticion.request.params.keys().sort()).toEqual(['pagina', 'producto', 'q', 'tamano']);
    expect(peticion.request.params.get('q')).toBe('quispe');
    peticion.flush({
      items: [{ id: ID, tipo_persona: 'NATURAL', tipo_documento: 'DNI', numero_documento: '45781236', denominacion: 'Quispe Mamani, Juana',
        celular_principal: '987654321', correo_principal: null, roles: [{ producto_codigo: 'CLI', rol: 'PACIENTE' }], coincidencia: 'NOMBRE' }],
      total: 21,
      pagina: 2,
      tamano: 20,
    });

    expect(await promesa).toEqual({
      items: [{ id: ID, tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '45781236', denominacion: 'Quispe Mamani, Juana',
        celularPrincipal: '987654321', correoPrincipal: null, roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE' }], coincidencia: 'NOMBRE' }],
      total: 21,
      pagina: 2,
      tamano: 20,
    });
  });

  it('buscarPorDocumento: encontrada, prellenado y aviso de TR-IDN', async () => {
    const encontrada = cliente.buscarPorDocumento('DNI', '45781236');
    http.expectOne(`${URL_PERSONAS}/busqueda?tipo=DNI&numero=45781236`).flush({ encontrada: true, persona: PERSONA });
    expect(await encontrada).toEqual({ encontrada: true, persona: RESUMEN_FRONT });

    const prellenada = cliente.buscarPorDocumento('DNI', '46027193');
    http.expectOne(`${URL_PERSONAS}/busqueda?tipo=DNI&numero=46027193`).flush({
      encontrada: false,
      prellenado: { nombres: 'Teresa', apellido_paterno: 'Condori', apellido_materno: 'Apaza', razon_social: null },
    });
    expect(await prellenada).toEqual({
      encontrada: false,
      prellenado: { nombres: 'Teresa', apellidoPaterno: 'Condori', apellidoMaterno: 'Apaza', razonSocial: null },
      aviso: null,
    });

    const caida = cliente.buscarPorDocumento('DNI', '47120983');
    http.expectOne(`${URL_PERSONAS}/busqueda?tipo=DNI&numero=47120983`).flush({ encontrada: false, prellenado: null, aviso: 'IDENTIDAD_NO_DISPONIBLE' });
    expect(await caida).toEqual({ encontrada: false, prellenado: null, aviso: 'IDENTIDAD_NO_DISPONIBLE' });
  });

  it('registrar envía el cuerpo en snake_case sin las claves vacías', async () => {
    const promesa = cliente.registrar({ tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '45781236', nombres: 'Juana',
      apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', celular: '987654321' });
    const peticion = http.expectOne({ method: 'POST', url: URL_PERSONAS });
    expect(peticion.request.body).toEqual({ tipo_persona: 'NATURAL', tipo_documento: 'DNI', numero_documento: '45781236', nombres: 'Juana',
      apellido_paterno: 'Quispe', apellido_materno: 'Mamani', celular: '987654321' });
    peticion.flush(DETALLE);

    expect(await promesa).toMatchObject({ ...RESUMEN_FRONT, version: 3, roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null }] });
  });

  it('un 409 PERSONA_DUPLICADA llega como ErrorPersonas con la persona existente', async () => {
    const promesa = cliente.registrar({ tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numeroDocumento: '45781236', celular: '987654321' });
    http.expectOne({ method: 'POST', url: URL_PERSONAS }).flush(
      { codigo: 'PERSONA_DUPLICADA', mensaje: 'Ya existe una persona con ese documento', persona_id: 'per-existente' },
      { status: 409, statusText: 'Conflict' },
    );

    const error = await promesa.catch((falla: unknown) => falla);
    expect(error).toBeInstanceOf(ErrorPersonas);
    expect(error).toMatchObject({ codigo: 'PERSONA_DUPLICADA', estado: 409, personaId: 'per-existente' });
  });

  it('obtener, actualizarDatosBasicos y asignarRol usan sus rutas', async () => {
    const obtenida = cliente.obtener(ID);
    http.expectOne({ method: 'GET', url: `${URL_PERSONAS}/${ID}` }).flush(DETALLE);
    expect((await obtenida).version).toBe(3);

    const actualizada = cliente.actualizarDatosBasicos(ID, { version: 3, nombres: 'Juana María', apellidoMaterno: null });
    const patch = http.expectOne({ method: 'PATCH', url: `${URL_PERSONAS}/${ID}` });
    expect(patch.request.body).toEqual({ version: 3, nombres: 'Juana María', apellido_materno: null });
    patch.flush({ ...DETALLE, version: 4 });
    expect((await actualizada).version).toBe(4);

    const rol = cliente.asignarRol(ID, { productoCodigo: 'GYM', rol: 'SOCIO' });
    const post = http.expectOne({ method: 'POST', url: `${URL_PERSONAS}/${ID}/roles` });
    expect(post.request.body).toEqual({ producto_codigo: 'GYM', rol: 'SOCIO' });
    post.flush({ asignado: true });
    expect(await rol).toEqual({ asignado: true });
  });

  it('productosSuscritos devuelve los códigos', async () => {
    const promesa = cliente.productosSuscritos();
    http.expectOne({ method: 'GET', url: `${URL_PERSONAS}/productos-suscritos` }).flush([{ producto_codigo: 'CLI' }, { producto_codigo: 'GYM' }]);
    expect(await promesa).toEqual(['CLI', 'GYM']);
  });
});
