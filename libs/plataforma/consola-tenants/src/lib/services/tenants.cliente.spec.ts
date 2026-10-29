import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { TenantsCliente } from './tenants.cliente';

const SUSCRIPCION_GYM = { producto_codigo: 'GYM', plan: 'PRO', estado: 'ACTIVA', vigente_hasta: '2026-12-31' };

const GYM = {
  id: 't-gym',
  codigo: 'gym-fuerza-total',
  nombre: 'Gym Fuerza Total',
  estado: 'SUSPENDIDO',
  creado_en: '2026-10-01T15:00:00.000Z',
  suscripciones: [SUSCRIPCION_GYM],
};

const SOLICITUD_POLLERIA = {
  codigo: 'polleria-dona-rosa',
  nombre: 'Pollería Doña Rosa',
  productoCodigo: 'REST',
  plan: 'BASICO',
  modalidad: 'PRUEBA',
  ruc: '20601234565',
  razonSocial: 'Pollería Doña Rosa S.A.C.',
  correoPropietario: 'rosa.quispe@gmail.com',
  nombrePropietario: 'Rosa Quispe',
} as const;

describe('TenantsCliente', () => {
  let cliente: TenantsCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(TenantsCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /org/tenants con filtros y página, y mapea a camelCase', async () => {
    const respuesta = cliente.listar({ q: 'gym', estado: 'SUSPENDIDO', producto: 'GYM', pagina: 2, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/tenants`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.toString()).toBe('pagina=2&tamano=20&q=gym&estado=SUSPENDIDO&producto=GYM');
    peticion.flush({ items: [GYM], total: 21 });

    await expect(respuesta).resolves.toEqual({
      items: [
        {
          id: 't-gym',
          codigo: 'gym-fuerza-total',
          nombre: 'Gym Fuerza Total',
          estado: 'SUSPENDIDO',
          creadoEn: '2026-10-01T15:00:00.000Z',
          suscripciones: [{ productoCodigo: 'GYM', plan: 'PRO', estado: 'ACTIVA', vigenteHasta: '2026-12-31' }],
        },
      ],
      total: 21,
    });
  });

  it('listar sin filtros solo envía la página', async () => {
    const respuesta = cliente.listar({ pagina: 1, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/tenants`);
    expect(peticion.request.params.keys()).toEqual(['pagina', 'tamano']);
    peticion.flush({ items: [], total: 0 });

    await expect(respuesta).resolves.toEqual({ items: [], total: 0 });
  });

  it('consultar pide GET /org/tenants/{id} y mapea empresa principal e historial', async () => {
    const respuesta = cliente.consultar('t-gym');

    http.expectOne(`${API_URL}/org/tenants/t-gym`).flush({
      ...GYM,
      estado_motivo: 'Deuda de 60 días',
      estado_cambiado_en: '2026-10-20T15:00:00.000Z',
      version: 3,
      empresa_principal: { id: 'e-1', ruc: '20512345671', razon_social: 'Fuerza Total S.A.C.' },
      historial: [
        {
          estado_anterior: 'ACTIVO',
          estado_nuevo: 'SUSPENDIDO',
          motivo: 'Deuda de 60 días',
          fecha_efectiva: '2026-10-20T15:00:00.000Z',
          registrado_en: '2026-10-20T15:00:01.000Z',
        },
      ],
    });

    await expect(respuesta).resolves.toMatchObject({
      estadoMotivo: 'Deuda de 60 días',
      version: 3,
      empresaPrincipal: { id: 'e-1', ruc: '20512345671', razonSocial: 'Fuerza Total S.A.C.' },
      historial: [{ estadoAnterior: 'ACTIVO', estadoNuevo: 'SUSPENDIDO', motivo: 'Deuda de 60 días', registradoEn: '2026-10-20T15:00:01.000Z' }],
    });
  });

  it('consultar con 404 da un ErrorConsola con el mensaje de la API', async () => {
    const respuesta = cliente.consultar('t-inexistente');

    http
      .expectOne(`${API_URL}/org/tenants/t-inexistente`)
      .flush({ codigo: 'NO_ENCONTRADO', mensaje: 'El tenant no existe' }, { status: 404, statusText: 'Not Found' });

    await expect(respuesta).rejects.toMatchObject({ name: 'ErrorConsola', codigo: 'NO_ENCONTRADO', message: 'El tenant no existe', estado: 404 });
  });

  it('crear envía el cuerpo en snake_case sin opcionales vacíos y mapea la respuesta', async () => {
    const respuesta = cliente.crear(SOLICITUD_POLLERIA);

    const peticion = http.expectOne(`${API_URL}/org/tenants`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      codigo: 'polleria-dona-rosa',
      nombre: 'Pollería Doña Rosa',
      producto_codigo: 'REST',
      plan: 'BASICO',
      modalidad: 'PRUEBA',
      ruc: '20601234565',
      razon_social: 'Pollería Doña Rosa S.A.C.',
      correo_propietario: 'rosa.quispe@gmail.com',
      nombre_propietario: 'Rosa Quispe',
    });
    peticion.flush({ tenant_id: 't-polleria', estado: 'PRUEBA', usuario_nuevo: true, correo_enviado: false, suscripcion_id: 's-1' }, { status: 201, statusText: 'Created' });

    await expect(respuesta).resolves.toEqual({ tenantId: 't-polleria', estado: 'PRUEBA', usuarioNuevo: true, correoEnviado: false });
  });

  it('crear en modalidad ACTIVO envía vigente_hasta y el nombre comercial', async () => {
    const respuesta = cliente.crear({ ...SOLICITUD_POLLERIA, modalidad: 'ACTIVO', vigenteHasta: '2027-10-28', nombreComercial: 'Doña Rosa' });

    const peticion = http.expectOne(`${API_URL}/org/tenants`);
    expect(peticion.request.body).toMatchObject({ modalidad: 'ACTIVO', vigente_hasta: '2027-10-28', nombre_comercial: 'Doña Rosa' });
    peticion.flush({ tenant_id: 't-polleria', estado: 'ACTIVO', usuario_nuevo: false, correo_enviado: true });

    await expect(respuesta).resolves.toMatchObject({ estado: 'ACTIVO', correoEnviado: true });
  });

  it('crear con código repetido da un ErrorConsola TENANT_DUPLICADO', async () => {
    const respuesta = cliente.crear(SOLICITUD_POLLERIA);

    http
      .expectOne(`${API_URL}/org/tenants`)
      .flush({ codigo: 'TENANT_DUPLICADO', mensaje: 'El código de tenant ya existe' }, { status: 409, statusText: 'Conflict' });

    await expect(respuesta).rejects.toMatchObject({ codigo: 'TENANT_DUPLICADO', message: 'El código de tenant ya existe', estado: 409 });
  });

  it('cambiarEstado envía POST /org/tenants/{id}/estado con estado y motivo', async () => {
    const respuesta = cliente.cambiarEstado('t-gym', { estado: 'BAJA', motivo: 'Cierre del local' });

    const peticion = http.expectOne(`${API_URL}/org/tenants/t-gym/estado`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ estado: 'BAJA', motivo: 'Cierre del local' });
    peticion.flush({ cambiado: true, estado: 'BAJA' });

    await expect(respuesta).resolves.toEqual({ cambiado: true, estado: 'BAJA' });
  });
});
