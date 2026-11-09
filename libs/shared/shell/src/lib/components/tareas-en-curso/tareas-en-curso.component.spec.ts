import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { MatProgressBarHarness } from '@angular/material/progress-bar/testing';
import { MatProgressSpinnerHarness } from '@angular/material/progress-spinner/testing';
import { provideRouter, Router } from '@angular/router';
import type { TareaEnCurso } from '../../models/tarea-en-curso';
import { TareasEnCursoService } from '../../services/tareas-en-curso.service';
import { TareasEnCursoComponent } from './tareas-en-curso.component';

const ubigeo: TareaEnCurso = {
  id: 'imp-1',
  titulo: 'Importando UBIGEO',
  avance: 42,
  detalle: 'Aplicando 42 %',
  ruta: '/consola/catalogos/UBIGEO?pestana=importaciones',
};
const cie10: TareaEnCurso = { id: 'imp-2', titulo: 'Importando CIE10', avance: null, detalle: 'En cola', ruta: null };

describe('TareasEnCursoComponent', () => {
  let tareas: TareasEnCursoService;

  async function montar() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tareas = TestBed.inject(TareasEnCursoService);
    const fixture = TestBed.createComponent(TareasEnCursoComponent);
    await fixture.whenStable();
    return { fixture, elemento: fixture.nativeElement as HTMLElement, cargador: TestbedHarnessEnvironment.loader(fixture) };
  }

  const boton = (elemento: HTMLElement) => elemento.querySelector<HTMLButtonElement>('[data-accion="tareas-en-curso"]');
  const regionViva = (elemento: HTMLElement) => elemento.querySelector('[aria-live="polite"]')?.textContent?.trim();

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((contenedor) => contenedor.replaceChildren()));

  it('sin tareas no pinta el botón', async () => {
    const { elemento } = await montar();
    expect(boton(elemento)).toBeNull();
    expect(regionViva(elemento)).toBe('');
  });

  it('con tareas muestra la insignia, el texto accesible y el promedio de los avances conocidos', async () => {
    const { fixture, elemento, cargador } = await montar();
    tareas.registrar(ubigeo);
    tareas.registrar(cie10);
    await fixture.whenStable();

    expect(boton(elemento)?.getAttribute('aria-label')).toBe('Tareas en curso: 2');
    expect(elemento.querySelector('.vit-insignia-tareas')?.textContent?.trim()).toBe('2');
    expect(elemento.querySelector('[data-texto="avance"]')?.textContent?.trim()).toBe('42 %');
    expect(regionViva(elemento)).toBe('Tareas en curso: 2');
    const spinner = await cargador.getHarness(MatProgressSpinnerHarness);
    expect([await spinner.getMode(), await spinner.getValue()]).toEqual(['determinate', 42]);
  });

  it('si ninguna tarea tiene avance el spinner es indeterminado y el texto dice «En cola»', async () => {
    const { fixture, elemento, cargador } = await montar();
    tareas.registrar(cie10);
    await fixture.whenStable();

    const spinner = await cargador.getHarness(MatProgressSpinnerHarness);
    expect(await spinner.getMode()).toBe('indeterminate');
    expect(elemento.querySelector('[data-texto="avance"]')?.textContent?.trim()).toBe('En cola');
  });

  it('registrar el mismo id dos veces deja una sola fila en el panel', async () => {
    const { fixture, cargador } = await montar();
    tareas.registrar(ubigeo);
    tareas.registrar({ ...ubigeo, avance: 50, detalle: 'Aplicando 50 %' });
    await fixture.whenStable();

    await (await cargador.getHarness(MatMenuHarness)).open();
    expect(document.querySelectorAll('[data-tarea]')).toHaveLength(1);
    expect(document.querySelector('[data-tarea]')?.textContent).toContain('Aplicando 50 %');
  });

  it('el panel muestra título, detalle, barra y el enlace solo si la tarea tiene ruta', async () => {
    const { fixture, cargador } = await montar();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    tareas.registrar(ubigeo);
    tareas.registrar(cie10);
    await fixture.whenStable();

    const menu = await cargador.getHarness(MatMenuHarness);
    await menu.open();
    const filas = [...document.querySelectorAll('[data-tarea]')].map((fila) => [...fila.querySelectorAll(':scope > div > span')].map((texto) => texto.textContent?.trim()));
    expect(filas).toEqual([
      ['Importando UBIGEO', 'Aplicando 42 %'],
      ['Importando CIE10', 'En cola'],
    ]);
    const barras = await TestbedHarnessEnvironment.documentRootLoader(fixture).getAllHarnesses(MatProgressBarHarness);
    expect(await Promise.all(barras.map(async (barra) => [await barra.getMode(), await barra.getValue()]))).toEqual([
      ['determinate', 42],
      ['indeterminate', null],
    ]);
    expect(document.querySelectorAll('[data-accion="ver-tarea"]')).toHaveLength(1);

    await menu.clickItem({ text: /Ver detalle/ });
    expect(navegar).toHaveBeenCalledWith('/consola/catalogos/UBIGEO?pestana=importaciones');
  });

  it('quitar la última tarea oculta el botón; vaciar también', async () => {
    const { fixture, elemento } = await montar();
    tareas.registrar(ubigeo);
    await fixture.whenStable();
    tareas.quitar('imp-1');
    await fixture.whenStable();
    expect(boton(elemento)).toBeNull();

    tareas.registrar(ubigeo);
    tareas.registrar(cie10);
    await fixture.whenStable();
    tareas.vaciar();
    await fixture.whenStable();
    expect(boton(elemento)).toBeNull();
  });
});
