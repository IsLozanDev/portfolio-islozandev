import type { TareaEnCurso } from '../models/tarea-en-curso';
import { avancePromedio } from './avance-promedio';

const tarea = (avance: number | null): TareaEnCurso => ({ id: `t-${avance}`, titulo: 'Tarea', avance, detalle: '', ruta: null });

describe('avancePromedio', () => {
  it('promedia solo los avances conocidos y redondea', () => {
    expect(avancePromedio([tarea(42), tarea(null), tarea(15)])).toBe(29);
  });

  it('un avance 0 cuenta como conocido', () => {
    expect(avancePromedio([tarea(0), tarea(null)])).toBe(0);
  });

  it('sin avances conocidos, o sin tareas, es null', () => {
    expect(avancePromedio([tarea(null), tarea(null)])).toBeNull();
    expect(avancePromedio([])).toBeNull();
  });
});
