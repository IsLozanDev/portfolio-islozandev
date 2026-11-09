import { Injectable, signal } from '@angular/core';
import type { TareaEnCurso } from '../models/tarea-en-curso';

/**
 * Tareas largas en curso que se muestran en la barra (spec 19d). Las registra la lib que las conoce; el
 * shell solo las pinta. En raíz, como `InsigniasMenuService`: quien registra puede cargarse diferida.
 */
@Injectable({ providedIn: 'root' })
export class TareasEnCursoService {
  private readonly actuales = signal<readonly TareaEnCurso[]>([]);

  readonly tareas = this.actuales.asReadonly();

  /** Reemplaza la tarea si el id ya existe. */
  registrar(tarea: TareaEnCurso): void {
    this.actuales.update((anteriores) => {
      const posicion = anteriores.findIndex((anterior) => anterior.id === tarea.id);
      if (posicion === -1) return [...anteriores, tarea];
      return anteriores.map((anterior, indice) => (indice === posicion ? tarea : anterior));
    });
  }

  /** Ignora ids desconocidos. */
  actualizar(id: string, cambios: Partial<Omit<TareaEnCurso, 'id'>>): void {
    this.actuales.update((anteriores) => anteriores.map((anterior) => (anterior.id === id ? { ...anterior, ...cambios } : anterior)));
  }

  quitar(id: string): void {
    this.actuales.update((anteriores) => anteriores.filter((anterior) => anterior.id !== id));
  }

  vaciar(): void {
    this.actuales.set([]);
  }
}
