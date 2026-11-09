import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ANIO_MAXIMO, ANIO_MINIMO } from '../../models/feriado';
import { SelectorAnioComponent } from './selector-anio.component';

describe('SelectorAnioComponent', () => {
  let fixture: ComponentFixture<SelectorAnioComponent>;
  let emitidos: number[];

  async function montar(anio: number): Promise<void> {
    fixture = TestBed.createComponent(SelectorAnioComponent);
    emitidos = [];
    fixture.componentInstance.cambio.subscribe((valor) => emitidos.push(valor));
    fixture.componentRef.setInput('anio', anio);
    await fixture.whenStable();
  }

  const boton = (accion: string): HTMLButtonElement => fixture.nativeElement.querySelector(`[data-accion="${accion}"]`);

  it('muestra el año y emite el anterior y el siguiente', async () => {
    await montar(2026);
    expect(fixture.nativeElement.querySelector('[data-anio]').textContent.trim()).toBe('2026');
    boton('anio-anterior').click();
    boton('anio-siguiente').click();
    expect(emitidos).toEqual([2025, 2027]);
  });

  it('en 2000 la flecha anterior está deshabilitada', async () => {
    await montar(ANIO_MINIMO);
    expect(boton('anio-anterior').disabled).toBe(true);
    expect(boton('anio-siguiente').disabled).toBe(false);
  });

  it('en 2100 la flecha siguiente está deshabilitada', async () => {
    await montar(ANIO_MAXIMO);
    expect(boton('anio-siguiente').disabled).toBe(true);
    expect(boton('anio-anterior').disabled).toBe(false);
  });
});
