/** Una tarea larga que otra lib registra para que el shell la muestre en la barra. */
export interface TareaEnCurso {
  /** Único entre tareas. */
  id: string;
  titulo: string;
  /** 0-100; null si aún no se conoce (indeterminado). */
  avance: number | null;
  detalle: string;
  /** Enlace del panel, o null si no hay a dónde ir. */
  ruta: string | null;
}
