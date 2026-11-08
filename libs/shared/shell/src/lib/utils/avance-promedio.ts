import type { TareaEnCurso } from '../models/tarea-en-curso';

/** Promedio redondeado de los avances conocidos; null si ninguna tarea tiene avance. */
export function avancePromedio(tareas: readonly TareaEnCurso[]): number | null {
  const conocidos = tareas.map((tarea) => tarea.avance).filter((avance): avance is number => avance !== null);
  if (conocidos.length === 0) return null;
  const suma = conocidos.reduce((total, avance) => total + avance, 0);
  return Math.round(suma / conocidos.length);
}
