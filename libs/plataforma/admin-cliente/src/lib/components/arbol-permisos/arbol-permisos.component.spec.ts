import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { estable } from '../../../testing/estable';
import type { ArbolPermisos } from '../../models/catalogo-permisos';
import { MENSAJES_ROLES } from '../../models/mensajes-admin';
import { ArbolPermisosComponent } from './arbol-permisos.component';

const permiso = (codigo: string, descripcion: string, sensible = false) => ({ codigo, descripcion, sensible, alcanceMinimo: 'UNIDAD' as const });

const ARBOL: ArbolPermisos = {
  productoCodigo: 'REST',
  modulos: [
    {
      codigo: 'salon',
      nombre: 'Salón',
      opciones: [
        { codigo: 'rest.salon.pedidos', nombre: 'Pedidos', permisos: [permiso('rest.pedido.anular', 'Anular pedidos', true), permiso('rest.pedido.tomar', 'Tomar pedidos')] },
        { codigo: 'rest.salon.mesas', nombre: 'Mesas', permisos: [permiso('rest.mesa.ver', 'Ver mesas')] },
      ],
    },
  ],
  otros: [permiso('rest.reporte.ver', 'Ver reportes')],
};

@Component({
  imports: [ArbolPermisosComponent],
  template: '<vit-arbol-permisos [arbol]="arbol()" [soloLectura]="soloLectura()" [(seleccionados)]="seleccionados" />',
})
class Anfitrion {
  readonly arbol = signal(ARBOL);
  readonly soloLectura = signal(false);
  readonly seleccionados = signal<ReadonlySet<string>>(new Set(['rest.pedido.tomar']));
}

describe('ArbolPermisosComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const seleccionados = () => [...fixture.componentInstance.seleccionados()].sort();
  const casilla = (selector: string) => {
    const entrada = elemento().querySelector<HTMLInputElement>(`${selector} input[type=checkbox]`);
    if (!entrada) throw new Error(`No hay casilla en ${selector}`);
    return entrada;
  };
  const casillaDeOpcion = (codigo: string) => casilla(`[data-opcion="${codigo}"] [data-grupo=opcion]`);
  const casillaDePermiso = (codigo: string) => casilla(`[data-permiso="${codigo}"]`);

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Anfitrion] });
    fixture = TestBed.createComponent(Anfitrion);
    await estable(fixture);
  });

  it('agrupa por módulo y opción, con los permisos sin opción en «Otros permisos»', () => {
    expect(elemento().querySelector('[data-modulo=salon]')?.textContent).toContain('Salón');
    expect([...elemento().querySelectorAll('[data-opcion]')].map((opcion) => opcion.getAttribute('data-opcion'))).toEqual(['rest.salon.pedidos', 'rest.salon.mesas']);
    expect(elemento().querySelector('[data-otros]')?.textContent).toContain(MENSAJES_ROLES.otrosPermisos);
    expect(elemento().querySelector('[data-otros] [data-permiso="rest.reporte.ver"]')).not.toBeNull();
  });

  it('TR-RN-009: los sensibles muestran «Requiere verificación»', () => {
    expect(elemento().querySelector('[data-permiso="rest.pedido.anular"] [data-sensible]')?.textContent?.trim()).toBe(MENSAJES_ROLES.sensible);
    expect(elemento().querySelector('[data-permiso="rest.pedido.tomar"] [data-sensible]')).toBeNull();
  });

  it('con un permiso de la opción marcado, la opción queda parcial; marcarla marca todos sus permisos', async () => {
    expect(casillaDeOpcion('rest.salon.pedidos').indeterminate).toBe(true);

    casillaDeOpcion('rest.salon.pedidos').click();
    await estable(fixture);

    expect(seleccionados()).toEqual(['rest.pedido.anular', 'rest.pedido.tomar']);
    expect(casillaDeOpcion('rest.salon.pedidos').checked).toBe(true);
    expect(casillaDeOpcion('rest.salon.pedidos').indeterminate).toBe(false);
  });

  it('desmarcar un permiso de una opción completa la deja parcial', async () => {
    fixture.componentInstance.seleccionados.set(new Set(['rest.pedido.tomar', 'rest.pedido.anular']));
    await estable(fixture);

    casillaDePermiso('rest.pedido.anular').click();
    await estable(fixture);

    expect(seleccionados()).toEqual(['rest.pedido.tomar']);
    expect(casillaDeOpcion('rest.salon.pedidos').indeterminate).toBe(true);
  });

  it('el checkbox del módulo marca todas sus opciones y el contador lo refleja', async () => {
    casilla('[data-modulo=salon] [data-grupo=modulo]').click();
    await estable(fixture);

    expect(seleccionados()).toEqual(['rest.mesa.ver', 'rest.pedido.anular', 'rest.pedido.tomar']);
    expect(elemento().querySelector('[data-contador]')?.textContent?.trim()).toBe(MENSAJES_ROLES.permisosSeleccionados(3));
  });

  it('en solo lectura las casillas están deshabilitadas y no cambian la selección', async () => {
    fixture.componentInstance.soloLectura.set(true);
    await estable(fixture);

    const casillas = [...elemento().querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    expect(casillas.length).toBeGreaterThan(0);
    expect(casillas.every((entrada) => entrada.disabled)).toBe(true);

    casillaDePermiso('rest.mesa.ver').click();
    await estable(fixture);
    expect(seleccionados()).toEqual(['rest.pedido.tomar']);
  });

  it('un catálogo vacío lo dice', async () => {
    fixture.componentInstance.arbol.set({ productoCodigo: 'GYM', modulos: [], otros: [] });
    await estable(fixture);

    expect(elemento().textContent).toContain(MENSAJES_ROLES.sinPermisosEnCatalogo);
  });
});
