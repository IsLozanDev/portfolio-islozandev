import { inject, Injectable } from '@angular/core';
import { map, switchMap, take, takeWhile, timer, type Observable } from 'rxjs';
import type { Emisor } from '../models/emisor';
import { pruebaEnProceso } from '../utils/reglas-emisor';
import { EmisoresCliente } from './emisores.cliente';

export const INTERVALO_CONSULTA_PRUEBA_MS = 3000;
/** Unos 2 min: después la página ofrece «Actualizar». */
export const MAXIMO_CONSULTAS_PRUEBA = 40;
const ULTIMA_CONSULTA = MAXIMO_CONSULTAS_PRUEBA - 1;

export interface EstadoSeguimiento {
  emisor: Emisor | null;
  /** La última consulta y la prueba sigue EN_PROCESO. */
  agotado: boolean;
}

/** El back es asíncrono (202) y no hay SSE para el resultado: se consulta el emisor hasta que la prueba deja EN_PROCESO. */
@Injectable({ providedIn: 'root' })
export class SeguimientoPruebaService {
  private readonly cliente = inject(EmisoresCliente);

  /** Termina al salir de EN_PROCESO o tras 40 consultas. Quien se suscribe lo corta al destruirse (`takeUntilDestroyed`). */
  seguir(empresaId: string): Observable<EstadoSeguimiento> {
    return timer(0, INTERVALO_CONSULTA_PRUEBA_MS).pipe(
      take(MAXIMO_CONSULTAS_PRUEBA),
      switchMap((consulta) =>
        this.cliente
          .observarEmisor(empresaId)
          .pipe(map((emisor) => ({ emisor, agotado: consulta === ULTIMA_CONSULTA && pruebaEnProceso(emisor) }))),
      ),
      takeWhile(({ emisor }) => pruebaEnProceso(emisor), true),
    );
  }
}
