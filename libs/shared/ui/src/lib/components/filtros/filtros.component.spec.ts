import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import type { DefinicionFiltro, ValorFiltros } from '../../models/filtro';
import { ESPERA_BUSQUEDA_MS, FiltrosComponent } from './filtros.component';

@Component({
  imports: [FiltrosComponent],
  template: '<vit-filtros [definiciones]="definiciones" (cambio)="cambios.push($event)" />',
})
class FiltrosDePrueba {
  readonly definiciones: DefinicionFiltro[] = [
    {
      clave: 'estado',
      etiqueta: 'Estado',
      opciones: [
        { valor: 'ACTIVO', etiqueta: 'Activo' },
        { valor: 'SUSPENDIDO', etiqueta: 'Suspendido' },
      ],
    },
  ];
  readonly cambios: ValorFiltros[] = [];
}

describe('FiltrosComponent', () => {
  let fixture: ComponentFixture<FiltrosDePrueba>;
  let anfitrion: FiltrosDePrueba;

  beforeEach(async () => {
    fixture = TestBed.createComponent(FiltrosDePrueba);
    anfitrion = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function escribir(texto: string): void {
    const campo: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
  }

  function pulsarLimpiar(): void {
    const boton = [...fixture.nativeElement.querySelectorAll('button')].find((candidato: HTMLButtonElement) => candidato.textContent?.trim() === 'Limpiar');
    boton.click();
  }

  it('emite una sola vez tras 300 ms sin teclear', () => {
    vi.useFakeTimers();
    escribir('a');
    escribir('an');
    escribir('ana');

    vi.advanceTimersByTime(ESPERA_BUSQUEDA_MS - 1);
    expect(anfitrion.cambios).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(anfitrion.cambios).toEqual([{ busqueda: 'ana', estado: null }]);
  });

  it('cambiar un select emite al instante con la búsqueda actual y cancela la espera', async () => {
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    vi.useFakeTimers();
    escribir('ana');
    vi.useRealTimers();

    await select.open();
    await select.clickOptions({ text: 'Suspendido' });

    expect(anfitrion.cambios).toEqual([{ busqueda: 'ana', estado: 'SUSPENDIDO' }]);
    await new Promise((resolver) => setTimeout(resolver, ESPERA_BUSQUEDA_MS + 50));
    expect(anfitrion.cambios).toHaveLength(1);
  });

  it('«Limpiar» vacía todo y emite una vez', async () => {
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await select.open();
    await select.clickOptions({ text: 'Activo' });
    anfitrion.cambios.length = 0;

    pulsarLimpiar();
    await fixture.whenStable();

    expect(anfitrion.cambios).toEqual([{ busqueda: '', estado: null }]);
    expect(await select.getValueText()).toBe('');
  });
});
