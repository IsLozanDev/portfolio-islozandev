import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { MiembrosCliente } from './miembros.cliente';

const ROSA = {
  membresia_id: 'm-rosa',
  usuario_id: 'u-rosa',
  nombre: 'Rosa Huamán',
  correo: 'rosa.huaman@gmail.com',
  estado: 'INVITADO',
  es_propietario: false,
  asignaciones_vigentes: 1,
  invitacion_expira_en: '2026-10-23T15:00:00.000Z',
};

describe('MiembrosCliente', () => {
  let cliente: MiembrosCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(MiembrosCliente);
  });

  afterEach(() => http.verify());

  it('listar pide GET /seg/miembros con orden, página, estado y búsqueda, y mapea a camelCase', async () => {
    const respuesta = cliente.listar({ estado: 'INVITADO', busqueda: 'rosa', orden: 'correo', direccion: 'desc', pagina: 2, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/seg/miembros`);
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.toString()).toBe('orden=correo&direccion=desc&pagina=2&tamano=20&estado=INVITADO&busqueda=rosa');
    peticion.flush({ items: [ROSA], total: 21 });

    await expect(respuesta).resolves.toEqual({
      items: [
        {
          membresiaId: 'm-rosa',
          usuarioId: 'u-rosa',
          nombre: 'Rosa Huamán',
          correo: 'rosa.huaman@gmail.com',
          estado: 'INVITADO',
          esPropietario: false,
          asignacionesVigentes: 1,
          invitacionExpiraEn: new Date('2026-10-23T15:00:00.000Z'),
        },
      ],
      total: 21,
    });
  });

  it('listar sin estado ni búsqueda no los envía', async () => {
    const respuesta = cliente.listar({ orden: 'nombre', direccion: 'asc', pagina: 1, tamano: 20 });

    const peticion = http.expectOne((solicitud) => solicitud.url === `${API_URL}/seg/miembros`);
    expect(peticion.request.params.keys()).toEqual(['orden', 'direccion', 'pagina', 'tamano']);
    peticion.flush({ items: [], total: 0 });

    await expect(respuesta).resolves.toEqual({ items: [], total: 0 });
  });

  it('detalle pide GET /seg/miembros/{id} y mapea las asignaciones', async () => {
    const respuesta = cliente.detalle('m-rosa');

    http.expectOne(`${API_URL}/seg/miembros/m-rosa`).flush({
      ...ROSA,
      desde: '2026-10-20T15:00:00.000Z',
      hasta: null,
      asignaciones: [
        {
          id: 'a-1',
          rol: { id: 'r-cajero', nombre: 'Cajero' },
          perfil: null,
          alcance: 'SUCURSAL',
          empresa: null,
          sucursal: { id: 's-mir', nombre: 'Miraflores' },
          unidad: null,
          vigente_desde: '2026-10-20',
          vigente_hasta: null,
          estado: 'REVOCADA',
          revocada_en: '2026-10-21T15:00:00.000Z',
          motivo_revocacion: 'Cese',
        },
      ],
    });

    await expect(respuesta).resolves.toMatchObject({
      desde: new Date('2026-10-20T15:00:00.000Z'),
      hasta: null,
      asignaciones: [
        {
          id: 'a-1',
          rol: { id: 'r-cajero', nombre: 'Cajero' },
          sucursal: { id: 's-mir', nombre: 'Miraflores' },
          vigenteDesde: '2026-10-20',
          vigenteHasta: null,
          estado: 'REVOCADA',
          revocadaEn: new Date('2026-10-21T15:00:00.000Z'),
          motivoRevocacion: 'Cese',
        },
      ],
    });
  });

  it('detalle con 404 da un ErrorAdmin con el mensaje de la API', async () => {
    const respuesta = cliente.detalle('m-ajena');

    http
      .expectOne(`${API_URL}/seg/miembros/m-ajena`)
      .flush({ codigo: 'NO_ENCONTRADO', mensaje: 'La membresía no existe' }, { status: 404, statusText: 'Not Found' });

    await expect(respuesta).rejects.toMatchObject({ name: 'ErrorAdmin', codigo: 'NO_ENCONTRADO', message: 'La membresía no existe', estado: 404 });
  });
});
