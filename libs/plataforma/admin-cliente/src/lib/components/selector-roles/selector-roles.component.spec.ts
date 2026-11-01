import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { estable } from '../../../testing/estable';
import { MENSAJES_PERFILES } from '../../models/mensajes-admin';
import type { RolDisponible } from '../../models/perfil';
import { SelectorRolesComponent } from './selector-roles.component';

const rol = (id: string, productoCodigo: string, productoNombre: string, predefinido = true): RolDisponible => ({
  id,
  codigo: id.toUpperCase(),
  nombre: `Rol ${id}`,
  productoCodigo,
  productoNombre,
  predefinido,
});

const ROLES = [rol('eco-gestor', 'ECO', 'Comercio'), rol('lib-vendedor', 'LIB', 'Librería'), rol('lib-propio', 'LIB', 'Librería', false)];

@Component({
  imports: [SelectorRolesComponent],
  template: '<vit-selector-roles [roles]="roles()" [soloLectura]="soloLectura()" [(seleccionados)]="seleccionados" />',
})
class Anfitrion {
  readonly roles = signal<RolDisponible[]>(ROLES);
  readonly soloLectura = signal(false);
  readonly seleccionados = signal<ReadonlySet<string>>(new Set(['lib-vendedor']));
}

describe('SelectorRolesComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const seleccionados = () => [...fixture.componentInstance.seleccionados()].sort();
  const casilla = (rolId: string) => {
    const entrada = elemento().querySelector<HTMLInputElement>(`[data-rol="${rolId}"] input[type=checkbox]`);
    if (!entrada) throw new Error(`No hay casilla del rol ${rolId}`);
    return entrada;
  };
  const contador = () => elemento().querySelector('[data-contador]')?.textContent?.trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Anfitrion] });
    fixture = TestBed.createComponent(Anfitrion);
    await estable(fixture);
  });

  it('TR-CA-034: agrupa los roles por producto, con el nombre del producto como título', () => {
    const grupos = [...elemento().querySelectorAll('[data-producto]')];

    expect(grupos.map((grupo) => grupo.getAttribute('data-producto'))).toEqual(['ECO', 'LIB']);
    expect(grupos[1].querySelector('legend')?.textContent?.trim()).toBe('Librería');
    expect([...grupos[1].querySelectorAll('[data-rol]')].map((fila) => fila.getAttribute('data-rol'))).toEqual(['lib-vendedor', 'lib-propio']);
  });

  it('marca los predefinidos y muestra nombre y código', () => {
    expect(elemento().querySelector('[data-rol="lib-vendedor"] [data-predefinido]')?.textContent?.trim()).toBe(MENSAJES_PERFILES.predefinido);
    expect(elemento().querySelector('[data-rol="lib-propio"] [data-predefinido]')).toBeNull();
    expect(elemento().querySelector('[data-rol="lib-propio"]')?.textContent).toContain('LIB-PROPIO');
  });

  it('TR-CA-035: solo muestra los roles que recibe', () => {
    expect(elemento().querySelector('[data-rol="cli-recepcion"]')).toBeNull();
  });

  it('marcar y desmarcar actualiza la selección y el contador', async () => {
    expect(contador()).toBe('1 rol seleccionado');
    expect(casilla('lib-vendedor').checked).toBe(true);

    casilla('eco-gestor').click();
    await estable(fixture);
    expect(seleccionados()).toEqual(['eco-gestor', 'lib-vendedor']);
    expect(contador()).toBe('2 roles seleccionados');

    casilla('lib-vendedor').click();
    await estable(fixture);
    expect(seleccionados()).toEqual(['eco-gestor']);
  });

  it('en solo lectura las casillas están deshabilitadas', async () => {
    fixture.componentInstance.soloLectura.set(true);
    await estable(fixture);

    expect(ROLES.every((disponible) => casilla(disponible.id).disabled)).toBe(true);
  });

  it('sin roles disponibles muestra el estado vacío', async () => {
    fixture.componentInstance.roles.set([]);
    await estable(fixture);

    expect(elemento().querySelector('vit-estado-vacio')?.textContent).toContain(MENSAJES_PERFILES.sinRolesDisponibles);
    expect(elemento().querySelector('[data-producto]')).toBeNull();
  });
});
