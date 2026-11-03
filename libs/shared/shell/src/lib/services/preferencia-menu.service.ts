import { Injectable, signal } from '@angular/core';

/** Por dispositivo: `"true"` si el menú de escritorio está oculto en la franja de iconos. */
export const CLAVE_MENU_COLAPSADO = 'vitrina.menu-colapsado';
const VALOR_COLAPSADO = 'true';

/** Recuerda si el menú lateral está oculto. Sin valor o sin `localStorage`, arranca visible. */
@Injectable({ providedIn: 'root' })
export class PreferenciaMenuService {
  private readonly estaColapsado = signal(leerAlmacen() === VALOR_COLAPSADO);

  readonly colapsado = this.estaColapsado.asReadonly();

  alternar(): void {
    this.cambiar(!this.estaColapsado());
  }

  mostrar(): void {
    if (!this.estaColapsado()) return;
    this.cambiar(false);
  }

  private cambiar(colapsado: boolean): void {
    this.estaColapsado.set(colapsado);
    escribirAlmacen(String(colapsado));
  }
}

// `localStorage` puede no existir o lanzar (modo privado, datos bloqueados): la preferencia queda solo en memoria.
function leerAlmacen(): string | null {
  try {
    return globalThis.localStorage?.getItem(CLAVE_MENU_COLAPSADO) ?? null;
  } catch {
    return null;
  }
}

function escribirAlmacen(valor: string): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_MENU_COLAPSADO, valor);
  } catch {
    // Sin almacén, la preferencia vive solo mientras dure la página.
  }
}
