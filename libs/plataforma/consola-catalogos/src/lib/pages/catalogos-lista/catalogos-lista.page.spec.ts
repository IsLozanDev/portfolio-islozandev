import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, type ConsolaDePrueba } from '../../../testing/rutas-de-prueba';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';

const URL_CATALOGOS = `${API_URL}/catalogos`;

const catalogo = (codigo: string, nombre: string, alcance: string, importable = false) => ({
  id: `c-${codigo}`,
  codigo,
  nombre,
  alcance,
  fuente: alcance === 'GLOBAL' ? 'SUNAT' : null,
  editable_por_tenant: alcance !== 'GLOBAL',
  version: 1,
  importable,
});

const CATALOGOS = [
  catalogo('ESPECIALIDAD', 'Especialidades', 'MIXTO'),
  catalogo('MEDIO_PAGO', 'Medios de pago', 'MIXTO'),
  catalogo('TIPO_PAGO_EXTRA', 'Otros pagos', 'TENANT'),
  catalogo('UBIGEO', 'Ubigeo', 'GLOBAL', true),
];

describe('CatalogosListaPage', () => {
  let sesion: DobleSesion;
  let consola: ConsolaDePrueba;

  const filas = () => [...consola.elemento().querySelectorAll('tr[mat-row]')].map((fila) => fila.querySelector('td')?.textContent?.trim());

  async function abrir(ruta = '/consola/catalogos'): Promise<void> {
    consola = await abrirConsola(ruta, sesion, crearDobleAvisos());
    consola.http.expectOne({ method: 'GET', url: URL_CATALOGOS }).flush(CATALOGOS);
    await consola.estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos(PERMISOS_CATALOGOS.leer);
  });

  afterEach(() => consola.http.verify());

  it('pide la lista una sola vez y muestra alcance, fuente e importable como texto', async () => {
    await abrir();

    expect(filas()).toEqual(['ESPECIALIDAD', 'MEDIO_PAGO', 'TIPO_PAGO_EXTRA', 'UBIGEO']);
    const ubigeo = consola.elemento().querySelectorAll('tr[mat-row]')[3]?.textContent ?? '';
    expect(ubigeo).toContain('Global');
    expect(ubigeo).toContain('SUNAT');
    const celdaImportable = consola.elemento().querySelectorAll('tr[mat-row]')[3]?.querySelectorAll('td')[5];
    expect(celdaImportable?.querySelector('mat-icon')?.textContent?.trim()).toBe('upload_file');
    expect(celdaImportable?.querySelector('.sr-only')?.textContent?.trim()).toBe('Importable');
  });

  it('el filtro MIXTO y q=pago de la URL filtran en el cliente y precargan los controles', async () => {
    await abrir('/consola/catalogos?alcance=MIXTO&q=pago');

    expect(filas()).toEqual(['MEDIO_PAGO']);
    expect(consola.elemento().querySelector<HTMLInputElement>('vit-filtros input')?.value).toBe('pago');
  });

  it('cambiar el filtro lo deja en la URL y vuelve a la primera página', async () => {
    await abrir('/consola/catalogos?pagina=2');
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');

    consola.harness.fixture.debugElement.query((nodo) => nodo.name === 'vit-filtros').componentInstance.cambio.emit({ busqueda: 'ubi', alcance: 'GLOBAL' });

    expect(navegar).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { q: 'ubi', alcance: 'GLOBAL', pagina: null, tamano: null } }));
  });

  it('con gestionar muestra «Nuevo catálogo»; sin él, no', async () => {
    await abrir();
    expect(consola.elemento().querySelector('[data-accion="nuevo"]')).toBeNull();
    consola.http.verify();

    TestBed.resetTestingModule();
    sesion = new DobleSesion().conPermisos(PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.gestionar);
    await abrir();
    expect(consola.elemento().querySelector('[data-accion="nuevo"]')?.getAttribute('href')).toBe('/consola/catalogos/nuevo');
  });

  it('sin plat.catalogo.leer la ruta lleva a /403', async () => {
    sesion = new DobleSesion().conPermisos();
    consola = await abrirConsola('/consola/catalogos', sesion, crearDobleAvisos());
    expect(consola.url()).toBe('/403');
  });
});
