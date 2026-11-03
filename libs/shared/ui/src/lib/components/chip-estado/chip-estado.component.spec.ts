import { TestBed } from '@angular/core/testing';
import type { TonoEstado } from '../../models/tono-estado';
import { CLASES_POR_TONO, ChipEstadoComponent, TONO_ESTADO_POR_DEFECTO } from './chip-estado.component';

async function crearChip(texto: string, tono?: TonoEstado): Promise<HTMLSpanElement> {
  const fixture = TestBed.createComponent(ChipEstadoComponent);
  fixture.componentRef.setInput('texto', texto);
  if (tono) fixture.componentRef.setInput('tono', tono);
  await fixture.whenStable();
  return fixture.nativeElement.querySelector('span');
}

describe('ChipEstadoComponent', () => {
  it('muestra el texto', async () => {
    const chip = await crearChip('Activo', 'exito');
    expect(chip.textContent?.trim()).toBe('Activo');
  });

  it.each(Object.keys(CLASES_POR_TONO) as TonoEstado[])('aplica las clases del tono %s', async (tono) => {
    const chip = await crearChip('Estado', tono);
    for (const clase of CLASES_POR_TONO[tono].split(' ')) {
      expect(chip.classList).toContain(clase);
    }
  });

  it('sin tono usa el neutro', async () => {
    const chip = await crearChip('Baja');
    expect(chip.classList).toContain(CLASES_POR_TONO[TONO_ESTADO_POR_DEFECTO].split(' ')[0]);
  });
});
