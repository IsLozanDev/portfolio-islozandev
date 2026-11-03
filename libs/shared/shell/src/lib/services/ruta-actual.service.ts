import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/** URL de la página actual como signal, al cargar y tras cada navegación. */
@Injectable({ providedIn: 'root' })
export class RutaActualService {
  private readonly router = inject(Router);

  readonly url = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      map((evento) => evento.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
}
