import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { FiltrosComponent } from '@vitrina/shared/ui';
import { estable } from '../../../testing/estable';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import { RolesListaPage } from './roles-lista.page';

const URL_ROLES = `${API_URL}/seg/roles`;
const rol = (id: string, codigo: string, producto: [string, string], predefinido: boolean, activo = true, totalPermisos = 2) => ({
  id,
  codigo,
  nombre: codigo.replace('_', ' '),
  producto_codigo: producto[0],
  producto_nombre: producto[1],
  predefinido,
  activo,
  total_permisos: totalPermisos,
});
const PLAT: [string, string] = ['PLAT', 'Plataforma'];
const REST: [string, string] = ['REST', 'Restaurante'];
const ROLES = [
  rol('r-1', 'PLAT_PROPIETARIO', PLAT, true, true, 16),
  rol('r-2', 'ADMIN_ROLES', PLAT, false),
  rol('r-3', 'REST_MOZO', REST, true, true, 3),
  rol('r-4', 'MOZO_TERRAZA', REST, false, false, 1),
];

describe('RolesListaPage', () => {
  let fixture: ComponentFixture<RolesListaPage>;
  let http: HttpTestingController;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const filas = () => [...elemento().querySelectorAll('tr[mat-row]')].map((fila) => fila.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const filtrar = async (valor: { busqueda: string } & Record<string, string | null>) => {
    (fixture.debugElement.query(By.directive(FiltrosComponent)).componentInstance as FiltrosComponent).cambio.emit(valor);
    await estable(fixture);
  };

  async function abrir(cuerpo: object = { items: ROLES }, estado = 200): Promise<void> {
    TestBed.configureTestingModule({
      imports: [RolesListaPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RolesListaPage);
    await fixture.whenStable();
    http.expectOne(URL_ROLES).flush(cuerpo, { status: estado, statusText: estado === 200 ? 'OK' : 'Error' });
    await estable(fixture);
  }

  afterEach(() => http.verify());

  it('muestra nombre, código, producto, tipo, estado y número de permisos', async () => {
    await abrir();

    expect(filas()).toHaveLength(4);
    expect(filas()[0]).toContain('PLAT PROPIETARIO');
    expect(filas()[0]).toContain('Plataforma');
    expect(filas()[0]).toContain('Predefinido');
    expect(filas()[0]).toContain('16');
    expect(filas()[3]).toContain('MOZO_TERRAZA');
    expect(filas()[3]).toContain('Propio');
    expect(filas()[3]).toContain('Inactivo');
  });

  it('filtra por producto y tipo en el cliente, sin pedir otra vez al servidor', async () => {
    await abrir();

    await filtrar({ busqueda: '', producto: 'REST', tipo: null });
    expect(filas().map((fila) => fila.split(' ')[0])).toEqual(['REST', 'MOZO']);

    await filtrar({ busqueda: '', producto: 'REST', tipo: 'propio' });
    expect(filas()).toHaveLength(1);
    expect(filas()[0]).toContain('MOZO_TERRAZA');

    await filtrar({ busqueda: '', producto: null, tipo: 'predefinido' });
    expect(filas()).toHaveLength(2);
    http.expectNone(URL_ROLES);
  });

  it('la búsqueda filtra por nombre o código sin distinguir mayúsculas', async () => {
    await abrir();

    await filtrar({ busqueda: '  terraza ', producto: null, tipo: null });

    expect(filas()).toHaveLength(1);
    expect(filas()[0]).toContain('MOZO_TERRAZA');
  });

  it('el filtro de producto ofrece los productos de los roles', async () => {
    await abrir();

    const definiciones = (fixture.debugElement.query(By.directive(FiltrosComponent)).componentInstance as FiltrosComponent).definiciones();
    expect(definiciones.find((definicion) => definicion.clave === 'producto')?.opciones).toEqual([
      { valor: 'PLAT', etiqueta: 'Plataforma' },
      { valor: 'REST', etiqueta: 'Restaurante' },
    ]);
  });

  it('sin roles, o sin coincidencias, muestra el estado vacío', async () => {
    await abrir({ items: [] });

    expect(elemento().textContent).toContain(MENSAJES_ROLES.sinRoles);
  });

  it('un error de la API se muestra como aviso con su mensaje', async () => {
    await abrir({ codigo: 'SIN_PERMISO' }, 403);

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe('No tiene permiso para esta acción.');
  });

  it('ofrece «Nuevo rol» y un enlace al detalle de cada rol', async () => {
    await abrir();

    expect(elemento().querySelector('[data-accion=nuevo]')?.getAttribute('href')).toBe('/nuevo');
    expect(elemento().querySelector('tr[mat-row] a')?.getAttribute('href')).toBe('/r-1');
  });
});
