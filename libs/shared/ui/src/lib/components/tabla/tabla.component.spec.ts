import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatSortHarness } from '@angular/material/sort/testing';
import { of } from 'rxjs';
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
    <vit-tabla [columnas]="columnas" [filas]="filas()" [total]="total()" [cargando]="cargando()" [indicePagina]="indicePagina()" [tamanoPagina]="tamanoPagina()" (pagina)="paginas.push($event)" (orden)="ordenes.push($event)">
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
  readonly indicePagina = signal(0);
  readonly tamanoPagina = signal<number | undefined>(undefined);
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
    expect(await paginador.getRangeLabel()).toBe('1 – 20 de 37');
    expect(texto()).toContain('Filas por página');
  });

  it('el combo ofrece 20, 50 y 100 filas y tamanoPagina elige una', async () => {
    const paginador = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    anfitrion.tamanoPagina.set(50);
    await fixture.whenStable();

    expect(await paginador.getPageSize()).toBe(50);
    expect(await paginador.getRangeLabel()).toBe('1 – 37 de 37');
    const combo = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await combo.open();
    const opciones = await combo.getOptions();
    expect(await Promise.all(opciones.map((opcion) => opcion.getText()))).toEqual(['20', '50', '100']);
  });

  it('ir a la página 2 emite { indice: 1, tamano: 20 }', async () => {
    const paginador = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    await paginador.goToNextPage();
    expect(anfitrion.paginas).toEqual([{ indice: 1, tamano: 20 }]);
    expect(await paginador.getRangeLabel()).toBe('21 – 37 de 37');
  });

  it('indicePagina vuelve el paginador a la primera página', async () => {
    const paginador = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatPaginatorHarness);
    anfitrion.indicePagina.set(1);
    await fixture.whenStable();
    expect(await paginador.getRangeLabel()).toBe('21 – 37 de 37');

    anfitrion.indicePagina.set(0);
    await fixture.whenStable();
    expect(await paginador.getRangeLabel()).toBe('1 – 20 de 37');
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

interface Membresia {
  correo: string;
  estado: string;
}

@Component({
  imports: [TablaComponent],
  template: '<vit-tabla [columnas]="columnas" [filas]="filas" [total]="1" />',
})
class TablaConTono {
  readonly columnas: ColumnaTabla<Membresia>[] = [
    { clave: 'correo', titulo: 'Correo' },
    { clave: 'estado', titulo: 'Estado', tono: (fila) => (fila.estado === 'Activo' ? 'exito' : 'neutro') },
  ];
  readonly filas: Membresia[] = [{ correo: 'ana@vitrina.pe', estado: 'Activo' }];
}

interface Archivo {
  nombre: string;
  importable: string;
}

@Component({
  imports: [TablaComponent],
  template: `<vit-tabla [columnas]="columnas" [filas]="filas" [total]="2" />`,
})
class TablaConIcono {
  readonly columnas: ColumnaTabla<Archivo>[] = [
    { clave: 'nombre', titulo: 'Nombre' },
    { clave: 'importable', titulo: 'Importable', icono: (fila) => (fila.importable === 'Sí' ? 'upload_file' : null) },
  ];
  readonly filas: Archivo[] = [
    { nombre: 'UBIGEO', importable: 'Sí' },
    { nombre: 'MEDIO_PAGO', importable: '—' },
  ];
}

describe('TablaComponent con ícono', () => {
  it('pinta el ícono con el valor como texto accesible; sin ícono, el valor', async () => {
    const fixture = TestBed.createComponent(TablaConIcono);
    await fixture.whenStable();
    const [, conIcono, , sinIcono] = fixture.nativeElement.querySelectorAll('td.mat-mdc-cell') as NodeListOf<HTMLElement>;

    expect(conIcono.querySelector('mat-icon')?.textContent?.trim()).toBe('upload_file');
    expect(conIcono.querySelector('mat-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(conIcono.querySelector('.sr-only')?.textContent?.trim()).toBe('Sí');
    expect(sinIcono.querySelector('mat-icon')).toBeNull();
    expect(sinIcono.textContent?.trim()).toBe('—');
  });
});

describe('TablaComponent con tono', () => {
  it('la columna con tono pinta un chip y la columna sin tono pinta texto', async () => {
    const fixture = TestBed.createComponent(TablaConTono);
    await fixture.whenStable();
    const [celdaCorreo, celdaEstado] = fixture.nativeElement.querySelectorAll('td.mat-mdc-cell') as NodeListOf<HTMLElement>;

    expect(celdaCorreo.querySelector('vit-chip-estado')).toBeNull();
    expect(celdaCorreo.textContent?.trim()).toBe('ana@vitrina.pe');
    const chip = celdaEstado.querySelector('vit-chip-estado span');
    expect(chip?.textContent?.trim()).toBe('Activo');
    expect(chip?.classList).toContain('bg-chip-exito');
  });
});

interface Contacto {
  nombre: string;
  correo: string;
  telefono: string;
  estado: string;
}

@Component({
  imports: [TablaComponent, AccionesFilaDirective],
  template: `
    <vit-tabla [columnas]="columnas" [filas]="filas" [total]="1">
      <ng-template vitAccionesFila let-fila>
        <button type="button">Ver {{ fila.nombre }}</button>
      </ng-template>
    </vit-tabla>
  `,
})
class TablaMovil {
  readonly columnas: ColumnaTabla<Contacto>[] = [
    { clave: 'nombre', titulo: 'Nombre', movil: 'titulo' },
    { clave: 'correo', titulo: 'Correo', movil: 'detalle' },
    { clave: 'telefono', titulo: 'Teléfono' },
    { clave: 'estado', titulo: 'Estado', movil: 'estado', tono: () => 'advertencia' },
  ];
  readonly filas: Contacto[] = [{ nombre: 'Ana Torres', correo: 'ana@vitrina.pe', telefono: '999888777', estado: 'Invitado' }];
}

function simularAncho(esMovil: boolean): void {
  const estado: BreakpointState = { matches: esMovil, breakpoints: {} };
  TestBed.overrideProvider(BreakpointObserver, { useValue: { observe: () => of(estado) } });
}

describe('TablaComponent en celular', () => {
  it('pinta una lista con título, detalle, chip de estado y acciones, sin las columnas sin movil', async () => {
    simularAncho(true);
    const fixture = TestBed.createComponent(TablaMovil);
    await fixture.whenStable();
    const elemento: HTMLElement = fixture.nativeElement;
    const item = elemento.querySelector('li');

    expect(elemento.querySelector('table')).toBeNull();
    expect(elemento.querySelectorAll('li')).toHaveLength(1);
    expect(item?.querySelector('.font-medium')?.textContent?.trim()).toBe('Ana Torres');
    expect(item?.textContent).toContain('ana@vitrina.pe');
    expect(item?.querySelector('vit-chip-estado span')?.classList).toContain('bg-chip-advertencia');
    expect(item?.querySelector('button')?.textContent).toBe('Ver Ana Torres');
    expect(item?.textContent).not.toContain('999888777');
  });

  it('en escritorio pinta la tabla con todas las columnas', async () => {
    simularAncho(false);
    const fixture = TestBed.createComponent(TablaMovil);
    await fixture.whenStable();
    const elemento: HTMLElement = fixture.nativeElement;

    expect(elemento.querySelector('ul')).toBeNull();
    expect(elemento.querySelector('table')?.textContent).toContain('999888777');
  });
});
