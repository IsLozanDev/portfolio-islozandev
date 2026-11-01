import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { FiltrosComponent } from '@vitrina/shared/ui';
import { estable } from '../../../testing/estable';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_PERFILES } from '../../models/mensajes-admin';
import { PerfilesListaPage } from './perfiles-lista.page';

const URL_PERFILES = `${API_URL}/seg/perfiles`;
const perfil = (id: string, codigo: string, nombre: string, predefinido: boolean, productos: string[], totalRoles: number) => ({
  id,
  codigo,
  nombre,
  predefinido,
  productos,
  total_roles: totalRoles,
});
const PERFILES = [
  perfil('p-1', 'CAJA', 'Caja', true, ['LIB'], 1),
  perfil('p-2', 'ENCARGADO', 'Encargado de tienda', false, ['ECO', 'LIB'], 2),
  perfil('p-3', 'SEGURIDAD', 'Encargado de seguridad', false, ['PLAT'], 3),
];

describe('PerfilesListaPage', () => {
  let fixture: ComponentFixture<PerfilesListaPage>;
  let http: HttpTestingController;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const filas = () => [...elemento().querySelectorAll('tr[mat-row]')].map((fila) => fila.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const filtrar = async (valor: { busqueda: string } & Record<string, string | null>) => {
    (fixture.debugElement.query(By.directive(FiltrosComponent)).componentInstance as FiltrosComponent).cambio.emit(valor);
    await estable(fixture);
  };

  async function abrir(cuerpo: object = { items: PERFILES }, estado = 200): Promise<void> {
    TestBed.configureTestingModule({
      imports: [PerfilesListaPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PerfilesListaPage);
    await fixture.whenStable();
    http.expectOne(URL_PERFILES).flush(cuerpo, { status: estado, statusText: estado === 200 ? 'OK' : 'Error' });
    await estable(fixture);
  }

  afterEach(() => http.verify());

  it('muestra nombre, código, tipo, productos y número de roles', async () => {
    await abrir();

    expect(filas()).toHaveLength(3);
    expect(filas()[0]).toContain('Caja');
    expect(filas()[0]).toContain('Predefinido');
    expect(filas()[1]).toContain('ENCARGADO');
    expect(filas()[1]).toContain('Propio');
    expect(filas()[1]).toContain('ECO, LIB');
    expect(filas()[2]).toContain('3');
  });

  it('filtra por tipo y por nombre o código en el cliente, sin pedir otra vez al servidor', async () => {
    await abrir();

    await filtrar({ busqueda: '', tipo: 'propio' });
    expect(filas()).toHaveLength(2);

    await filtrar({ busqueda: '  SEGURIDAD ', tipo: 'propio' });
    expect(filas()).toHaveLength(1);
    expect(filas()[0]).toContain('Encargado de seguridad');

    await filtrar({ busqueda: 'caja', tipo: 'predefinido' });
    expect(filas()).toHaveLength(1);
    http.expectNone(URL_PERFILES);
  });

  it('sin perfiles, o sin coincidencias, muestra el estado vacío', async () => {
    await abrir({ items: [] });

    expect(elemento().textContent).toContain(MENSAJES_PERFILES.sinPerfiles);
  });

  it('un error de la API se muestra como aviso con su mensaje', async () => {
    await abrir({ codigo: 'SIN_PERMISO' }, 403);

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('No tiene permiso para esta acción.');
  });

  it('ofrece «Nuevo perfil» y un enlace al detalle de cada perfil', async () => {
    await abrir();

    expect(elemento().querySelector('[data-accion=nuevo]')?.getAttribute('href')).toBe('/nuevo');
    expect(elemento().querySelector('tr[mat-row] a')?.getAttribute('href')).toBe('/p-1');
  });
});
