import { TestBed } from '@angular/core/testing';
import type { Previsualizacion } from '../../models/importacion';
import { ResumenPrevisualizacionComponent } from './resumen-previsualizacion.component';

const fila = (codigo: string, nombre: string, atributos: Record<string, string>) => ({ fila: 2, codigo, codigoExterno: null, nombre, abreviatura: null, orden: 0, atributos });
const antes = (codigo: string, nombre: string, atributos: Record<string, string>) => ({ id: 'i', codigo, codigoExterno: null, nombre, abreviatura: null, orden: 0, atributos });

const PREVIA: Previsualizacion = {
  id: 'p',
  version: 0,
  estado: 'PREVISUALIZADA',
  versionOficial: '2026',
  fechaVigencia: '2026-11-08',
  resumen: { altas: 0, cambios: 1, bajas: 0, sinCambios: 0, totalFilas: 1 },
  muestra: {
    altas: [],
    cambios: [{ antes: antes('010101', 'CHACHAPOYAS', { provincia: 'CHACHAPOYAS', departamento: 'AMAZONAS' }), despues: fila('010101', 'CHACHAPOYAS (humo)', { departamento: 'AMAZONAS', provincia: 'CHACHAPOYAS' }) }],
    bajas: [],
  },
  venceEn: '2026-11-09T15:00:00Z',
};

describe('ResumenPrevisualizacionComponent', () => {
  it('en un cambio muestra solo los campos que difieren; los atributos en otro orden no cuentan', async () => {
    const fixture = TestBed.createComponent(ResumenPrevisualizacionComponent);
    fixture.componentRef.setInput('previsualizacion', PREVIA);
    await fixture.whenStable();
    (fixture.nativeElement.querySelectorAll('[role="tab"]')[1] as HTMLElement).click();
    await fixture.whenStable();
    await new Promise((resolver) => setTimeout(resolver, 50));
    await fixture.whenStable();

    const filas = [...fixture.nativeElement.querySelectorAll('[data-muestra="cambios"] tr[mat-row]')].map((celda: HTMLElement) => celda.textContent?.replace(/\s+/g, ' ').trim());
    expect(filas).toEqual(['010101 Nombre CHACHAPOYAS CHACHAPOYAS (humo)']);
  });
});
