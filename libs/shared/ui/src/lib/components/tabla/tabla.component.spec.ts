import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatSortHarness } from '@angular/material/sort/testing';
import { AccionesFilaDirective } from '../../directives/acciones-fila.directive';
import type { CambioOrden, CambioPagina, ColumnaTabla } from '../../models/columna-tabla';
import { TablaComponent } from './tabla.component';

interface Usuario {
  id: string;
  nombre: string;
  correo: string;
}

const TOTAL_USUARIOS = 37;
const USUARIOS: Usuario[] = Array.from({ length: 10 }, (_, indice) => ({
  id: `u-${indice}`,
  nombre: `Usuario ${indice}`,
  correo: `usuario${indice}@vitrina.pe`,
}));

@Component({
  imports: [TablaComponent, AccionesFilaDirective],
  template: `
    <vit-tabla [columnas]="columnas" [filas]="filas()" [total]="total()" [cargando]="cargando()" (pagina)="paginas.push($event)" (orden)="ordenes.push($event)">
      <ng-template vitAccionesFila let-fila>
        <button type="button">Editar {{ fila.nombre }}</button>
      </ng-template>
    </vit-tabla>
  `,
})
class TablaDePrueba {
  readonly columnas: ColumnaTabla<Usuario>[] = [
    { clave: 'nombre', titulo: 'Nombre', ordenable: true },
    { clave: 'correo', titulo: 'Correo' },
  ];
  readonly filas = signal<Usuario[]>(USUARIOS);
  readonly total = signal(TOTAL_USUARIOS);
  readonly cargando = signal(false);
  readonly paginas: CambioPagina[] = [];
  readonly ordenes: CambioOrden[] = [];
}

describe('TablaComponent', () => {
  let fixture: ComponentFixture<TablaDePrueba>;
  let anfitrion: TablaDePrueba;

  beforeEach(async () => {
    fixture = TestBed.createComponent(TablaDePrueba);
    anfitrion = fixture.componentInstance;
    await fixture.whenStable();
  });

  function texto(): string {
    return fixture.nativeElement.textContent;
  }

  it('pinta cabeceras, celdas y la columna de acciones con la fila como contexto', () => {
    const cabeceras = [...fixture.nativeElement.querySelectorAll('th')].map((celda: HTMLElement) => celda.textContent?.trim());
    expect(cabeceras).toEqual(['Nombre', 'Correo', 'Acciones']);
    expect(fixture.nativeElement.querySelectorAll('tr.mat-mdc-row')).toHaveLength(10);
    expect(texto()).toContain('usuario3@vitrina.pe');
    expect(texto()).toContain('Editar Usuario 3');
  });

  it('sin filas muestra «No hay registros.»', async () => {
    anfitrion.filas.set([]);
    anfitrion.total.set(0);
    await fixture.whenStable();
    expect(texto()).toContain('No hay registros.');
    expect(texto()).toContain('0 de 0');
  });

  it('cargando muestra el spinner y no el estado vacío', async () => {
    anfitrion.filas.set([]);
    anfitrion.cargando.set(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('vit-cargando')).not.toBeNull();
    expect(texto()).not.toContain('No hay registros.');
  });

  it('el paginador está en español', async () => {
    const paginador = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    expect(await paginador.getRangeLabel()).toBe('1 – 10 de 37');
    expect(texto()).toContain('Filas por página');
  });

  it('ir a la página 2 emite { indice: 1, tamano: 10 }', async () => {
    const paginador = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    await paginador.goToNextPage();
    expect(anfitrion.paginas).toEqual([{ indice: 1, tamano: 10 }]);
    expect(await paginador.getRangeLabel()).toBe('11 – 20 de 37');
  });

  it('una cabecera ordenable emite orden; una no ordenable no', async () => {
    const orden = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSortHarness);
    const [nombre, correo] = await orden.getSortHeaders();

    await nombre.click();
    await correo.click();

    expect(await correo.isDisabled()).toBe(true);
    expect(anfitrion.ordenes).toEqual([{ clave: 'nombre', direccion: 'asc' }]);
  });
});
