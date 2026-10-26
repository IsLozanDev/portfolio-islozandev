import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { contextoDePrueba, DobleSupabase, proveerAuthDePrueba, responderMiContexto } from '../testing/doble-supabase';
import { SesionService } from './sesion.service';
import { SiPermisoDirective } from './si-permiso.directive';

@Component({
  imports: [SiPermisoDirective],
  template: `
    <span id="uno" *siPermiso="'rest.caja.abrir'">abrir</span>
    <span id="lista" *siPermiso="['rest.caja.cerrar', 'rest.venta.anular']">alguno</span>
  `,
})
class Anfitrion {}

describe('SiPermisoDirective', () => {
  let http: HttpTestingController;
  let sesion: SesionService;

  async function cargarPermisos(permisos: string[]): Promise<void> {
    await Promise.all([sesion.cargarContexto(), responderMiContexto(http, contextoDePrueba({ permisos }))]);
  }

  function renderizar() {
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    return fixture;
  }

  function visible(fixture: ReturnType<typeof renderizar>, id: string): boolean {
    return (fixture.nativeElement as HTMLElement).querySelector(`#${id}`) !== null;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: proveerAuthDePrueba(new DobleSupabase()) });
    http = TestBed.inject(HttpTestingController);
    sesion = TestBed.inject(SesionService);
  });

  afterEach(() => http.verify());

  it('con una cadena muestra el contenido solo si tiene el permiso', async () => {
    await cargarPermisos(['rest.caja.abrir']);
    const fixture = renderizar();

    expect(visible(fixture, 'uno')).toBe(true);
    expect(visible(fixture, 'lista')).toBe(false);
  });

  it('con una lista lo muestra si tiene cualquiera', async () => {
    await cargarPermisos(['rest.venta.anular']);
    const fixture = renderizar();

    expect(visible(fixture, 'uno')).toBe(false);
    expect(visible(fixture, 'lista')).toBe(true);
  });

  it('sin contexto no muestra nada', () => {
    const fixture = renderizar();

    expect(visible(fixture, 'uno')).toBe(false);
    expect(visible(fixture, 'lista')).toBe(false);
  });

  it('se actualiza al cambiar el contexto', async () => {
    await cargarPermisos(['rest.caja.abrir']);
    const fixture = renderizar();
    expect(visible(fixture, 'uno')).toBe(true);

    await cargarPermisos(['rest.caja.cerrar']);
    await fixture.whenStable();

    expect(visible(fixture, 'uno')).toBe(false);
    expect(visible(fixture, 'lista')).toBe(true);
  });
});
