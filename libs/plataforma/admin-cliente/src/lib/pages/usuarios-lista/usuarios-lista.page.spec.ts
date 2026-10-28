import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { FiltrosComponent, TablaComponent } from '@vitrina/shared/ui';
import { DobleSesion } from '../../../testing/doble-sesion';
import { estable } from '../../../testing/estable';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_ADMIN } from '../../models/mensajes-admin';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { UsuariosListaPage } from './usuarios-lista.page';

const URL_MIEMBROS = `${API_URL}/seg/miembros`;
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

describe('UsuariosListaPage', () => {
  let fixture: ComponentFixture<UsuariosListaPage>;
  let http: HttpTestingController;
  let sesion: DobleSesion;

  const esperarLista = (): TestRequest => http.expectOne((solicitud) => solicitud.url === URL_MIEMBROS);
  const parametros = (peticion: TestRequest) => Object.fromEntries(peticion.request.params.keys().map((clave) => [clave, peticion.request.params.get(clave)]));
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function abrir(): Promise<TestRequest> {
    TestBed.configureTestingModule({
      imports: [UsuariosListaPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(UsuariosListaPage);
    await fixture.whenStable();
    return esperarLista();
  }

  async function responder(peticion: TestRequest, cuerpo: object): Promise<void> {
    peticion.flush(cuerpo);
    await estable(fixture);
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.usuarioInvitar);
  });

  afterEach(() => http.verify());

  it('pide la primera página ordenada por nombre y muestra cada fila como texto', async () => {
    const peticion = await abrir();
    expect(parametros(peticion)).toEqual({ orden: 'nombre', direccion: 'asc', pagina: '1', tamano: '20' });

    await responder(peticion, { items: [ROSA, { ...ROSA, membresia_id: 'm-ana', nombre: 'Ana Torres', estado: 'ACTIVO', es_propietario: true, invitacion_expira_en: null }], total: 2 });

    const filas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr[mat-row]')].map((fila) => fila.textContent ?? '');
    expect(filas[0]).toContain('Rosa Huamán');
    expect(filas[0]).toContain('Invitado');
    expect(filas[0]).toContain('No');
    expect(filas[0]).toContain('23/10/26');
    expect(filas[1]).toContain('Activo');
    expect(filas[1]).toContain(MENSAJES_ADMIN.si);
    expect(filas[1]).toContain(MENSAJES_ADMIN.sinFecha);
  });

  it('cambiar el filtro o la búsqueda vuelve a pedir la página 1', async () => {
    await responder(await abrir(), { items: [ROSA], total: 41 });
    const tabla = fixture.debugElement.query(By.directive(TablaComponent)).componentInstance as TablaComponent<object>;
    tabla.pagina.emit({ indice: 2, tamano: 20 });
    await responder(esperarLista(), { items: [ROSA], total: 41 });

    const filtros = fixture.debugElement.query(By.directive(FiltrosComponent)).componentInstance as FiltrosComponent;
    filtros.cambio.emit({ busqueda: '  pared ', estado: 'ACTIVO' });
    const peticion = esperarLista();

    expect(parametros(peticion)).toEqual({ orden: 'nombre', direccion: 'asc', pagina: '1', tamano: '20', estado: 'ACTIVO', busqueda: 'pared' });
    await responder(peticion, { items: [], total: 0 });
  });

  it('cambiar de página u orden pide esos parámetros; sin dirección vuelve al orden por nombre', async () => {
    await responder(await abrir(), { items: [ROSA], total: 120 });
    const tabla = fixture.debugElement.query(By.directive(TablaComponent)).componentInstance as TablaComponent<object>;

    tabla.pagina.emit({ indice: 1, tamano: 50 });
    const pagina = esperarLista();
    expect(parametros(pagina)).toMatchObject({ pagina: '2', tamano: '50' });
    await responder(pagina, { items: [ROSA], total: 120 });

    tabla.orden.emit({ clave: 'correo', direccion: 'desc' });
    const orden = esperarLista();
    expect(parametros(orden)).toMatchObject({ orden: 'correo', direccion: 'desc', pagina: '1', tamano: '50' });
    await responder(orden, { items: [ROSA], total: 120 });

    tabla.orden.emit({ clave: 'correo', direccion: '' });
    const sinOrden = esperarLista();
    expect(parametros(sinOrden)).toMatchObject({ orden: 'nombre', direccion: 'asc' });
    await responder(sinOrden, { items: [ROSA], total: 120 });
  });

  it('sin miembros muestra el estado vacío', async () => {
    await responder(await abrir(), { items: [], total: 0 });

    expect(texto()).toContain(MENSAJES_ADMIN.sinMiembros);
  });

  it('un error de la API se muestra como aviso con su mensaje', async () => {
    const peticion = await abrir();
    peticion.flush({ codigo: 'SIN_PERMISO', permiso: 'plat.usuario.invitar' }, { status: 403, statusText: 'Forbidden' });
    await estable(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent?.trim()).toBe('No tiene permiso para esta acción.');
  });

  it('el botón «Invitar usuario» solo aparece con plat.usuario.invitar', async () => {
    await responder(await abrir(), { items: [], total: 0 });
    expect(texto()).toContain(MENSAJES_ADMIN.invitarUsuario);

    sesion.conPermisos();
    await fixture.whenStable();
    expect(texto()).not.toContain(MENSAJES_ADMIN.invitarUsuario);
  });
});
