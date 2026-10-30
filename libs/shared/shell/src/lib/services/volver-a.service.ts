import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { PARAMETRO_VOLVER_A, urlDeVuelta } from '@vitrina/shared/auth';
import { filter } from 'rxjs';
import { ORIGENES_VOLVER_A } from '../config/volver-a.config';

export interface DestinoVolverA {
  url: string;
  nombreApp: string;
}

/** Sobrevive a recargar la página y se borra al cerrar la pestaña. Solo guarda la URL ya validada. */
export const CLAVE_ALMACEN_VOLVER_A = 'vitrina.volverA';

/**
 * Enlace de vuelta a la app de origen tras una entrada profunda con `?volverA=` (U-06). Solo acepta
 * orígenes de la lista blanca del ambiente (TR-RNF-012); un valor rechazado no cambia el destino guardado.
 */
@Injectable({ providedIn: 'root' })
export class VolverAService {
  private readonly router = inject(Router);
  private readonly origenes = inject(ORIGENES_VOLVER_A);
  private readonly destinoActual = signal<DestinoVolverA | null>(this.destinoDe(leerAlmacen()));

  readonly destino = this.destinoActual.asReadonly();

  constructor() {
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((evento) => this.capturar(evento.urlAfterRedirects));
  }

  /** Al salir: la sesión compartida terminó y el enlace ya no aplica. */
  limpiar(): void {
    this.destinoActual.set(null);
    escribirAlmacen(null);
  }

  private capturar(url: string): void {
    const destino = this.destinoDe(this.router.parseUrl(url).queryParamMap.get(PARAMETRO_VOLVER_A));
    if (!destino) return;
    this.destinoActual.set(destino);
    escribirAlmacen(destino.url);
  }

  /** También al restaurar: si la lista blanca cambió, un valor guardado viejo deja de valer. */
  private destinoDe(valor: string | null): DestinoVolverA | null {
    const url = urlDeVuelta(valor, Object.keys(this.origenes));
    return url ? { url, nombreApp: this.origenes[new URL(url).origin] } : null;
  }
}

// `sessionStorage` puede no existir o lanzar (modo privado, datos bloqueados): el enlace queda solo en memoria.
function leerAlmacen(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(CLAVE_ALMACEN_VOLVER_A) ?? null;
  } catch {
    return null;
  }
}

function escribirAlmacen(url: string | null): void {
  try {
    if (url) globalThis.sessionStorage?.setItem(CLAVE_ALMACEN_VOLVER_A, url);
    else globalThis.sessionStorage?.removeItem(CLAVE_ALMACEN_VOLVER_A);
  } catch {
    // Sin almacén, el enlace vive solo mientras dure la página.
  }
}
