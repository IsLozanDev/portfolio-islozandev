import { inject, Injectable } from '@angular/core';
import { TareasEnCursoService } from '@vitrina/shared/shell';
import { Subject, type Observable } from 'rxjs';
import { mensajeTituloImportando, MENSAJES_SEGUIMIENTO } from '../models/mensajes-catalogos';

/**
 * Seguimiento global de las importaciones del usuario (spec 19d). Vive en raíz: el usuario sigue navegando
 * mientras el worker aplica. El stream SSE, la recuperación y los avisos llegan en el paso 8.
 */
@Injectable({ providedIn: 'root' })
export class SeguimientoImportacionesService {
  private readonly tareas = inject(TareasEnCursoService);
  private readonly terminadasInterno = new Subject<string>();

  /** Id de cada importación que terminó; el detalle abierto recarga su historial y sus ítems. */
  readonly terminadas: Observable<string> = this.terminadasInterno.asObservable();

  /** Idempotente: registrar dos veces la misma importación deja una sola tarea. */
  seguir(importacionId: string, codigoCatalogo: string): void {
    this.tareas.registrar({
      id: importacionId,
      titulo: mensajeTituloImportando(codigoCatalogo),
      avance: null,
      detalle: MENSAJES_SEGUIMIENTO.enCola,
      ruta: rutaDelHistorial(codigoCatalogo),
    });
  }
}

const RUTA_CATALOGOS = '/consola/catalogos';
const PESTANA_IMPORTACIONES = 'pestana=importaciones';

function rutaDelHistorial(codigoCatalogo: string): string {
  return `${RUTA_CATALOGOS}/${encodeURIComponent(codigoCatalogo)}?${PESTANA_IMPORTACIONES}`;
}
