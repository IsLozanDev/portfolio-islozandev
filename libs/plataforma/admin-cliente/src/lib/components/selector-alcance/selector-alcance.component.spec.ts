import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { estable } from '../../../testing/estable';
import { API_URL } from '../../../testing/http-de-prueba';
import { crearGrupoAsignacion } from '../../utils/formulario-asignacion';
import { SelectorAlcanceComponent } from './selector-alcance.component';

@Component({
  imports: [SelectorAlcanceComponent],
  template: '<vit-selector-alcance [grupo]="grupo" />',
})
class Anfitrion {
  readonly grupo = crearGrupoAsignacion();
}

describe('SelectorAlcanceComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let http: HttpTestingController;

  const esperar = (ruta: string): TestRequest => http.expectOne((solicitud) => solicitud.url === `${API_URL}${ruta}`);
  const campos = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-campo]')].map((campo) => campo.getAttribute('data-campo'));
  const grupo = () => fixture.componentInstance.grupo;

  async function responder(peticion: TestRequest, items: object[]): Promise<void> {
    peticion.flush({ items, total: items.length });
    await estable(fixture);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Anfitrion],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    await responder(esperar('/org/empresas'), [{ id: 'e-1', razon_social: 'Sabores del Sur SAC' }]);
  });

  afterEach(() => http.verify());

  it('cada alcance muestra los niveles de ubicación que pide', async () => {
    const camposCon = async (alcance: 'TENANT' | 'EMPRESA' | 'SUCURSAL' | 'UNIDAD') => {
      grupo().controls.alcance.setValue(alcance);
      await estable(fixture);
      return campos();
    };

    expect(await camposCon('TENANT')).toEqual(['alcance']);
    expect(await camposCon('EMPRESA')).toEqual(['alcance', 'empresa']);
    expect(await camposCon('SUCURSAL')).toEqual(['alcance', 'empresa', 'sucursal']);
    expect(await camposCon('UNIDAD')).toEqual(['alcance', 'empresa', 'sucursal', 'unidad']);
  });

  it('con UNIDAD pide sucursales de la empresa y unidades de la sucursal, en cascada (TR-CA-036)', async () => {
    grupo().controls.alcance.setValue('UNIDAD');
    grupo().controls.empresaId.setValue('e-1');
    await responder(esperar('/org/empresas/e-1/sucursales'), [{ id: 's-mir', codigo: 'MIRAFLORES', nombre: 'Miraflores' }]);

    grupo().controls.sucursalId.setValue('s-mir');
    const unidades = esperar('/org/unidades');
    expect(unidades.request.params.get('sucursal_id')).toBe('s-mir');
    await responder(unidades, [{ id: 'u-2', codigo: 'CAJA-02', nombre: 'Caja 2' }]);

    grupo().controls.unidadId.setValue('u-2');
    expect(grupo().valid).toBe(false);
    grupo().controls.asignable.setValue('rol:r-cajero');
    expect(grupo().valid).toBe(true);
  });

  it('cambiar la empresa vacía la sucursal y la unidad elegidas', async () => {
    grupo().controls.alcance.setValue('UNIDAD');
    grupo().controls.empresaId.setValue('e-1');
    await responder(esperar('/org/empresas/e-1/sucursales'), [{ id: 's-mir', codigo: 'MIRAFLORES', nombre: 'Miraflores' }]);
    grupo().controls.sucursalId.setValue('s-mir');
    await responder(esperar('/org/unidades'), [{ id: 'u-2', codigo: 'CAJA-02', nombre: 'Caja 2' }]);
    grupo().controls.unidadId.setValue('u-2');

    grupo().controls.empresaId.setValue('e-2');
    await responder(esperar('/org/empresas/e-2/sucursales'), []);

    expect(grupo().getRawValue()).toMatchObject({ empresaId: 'e-2', sucursalId: null, unidadId: null });
  });

  it('si org no responde, avisa con el mensaje de la API', async () => {
    grupo().controls.alcance.setValue('SUCURSAL');
    grupo().controls.empresaId.setValue('e-1');
    esperar('/org/empresas/e-1/sucursales').flush({ codigo: 'SIN_PERMISO', permiso: 'plat.organizacion.consultar' }, { status: 403, statusText: 'Forbidden' });
    await estable(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent?.trim()).toBe('No tiene permiso para esta acción.');
  });
});
