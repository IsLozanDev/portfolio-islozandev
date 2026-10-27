/**
 * Completa en jsdom lo que SweetAlert2 necesita del navegador:
 * - `matchMedia`, que consulta al abrir un popup.
 * - `innerText`, con el que escribe `titleText` e `inputLabel`.
 * - `offsetWidth`, con el que decide qué está visible (y a qué botón da el foco):
 *   se emula como «visible si no tiene `display: none`».
 */
export function prepararSweetAlertEnJsdom(): void {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (consulta: string): MediaQueryList =>
      ({
        matches: false,
        media: consulta,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }

  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
    set(this: HTMLElement, valor: string) {
      this.textContent = valor;
    },
  });

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return estaOculto(this) ? 0 : 1;
    },
  });
}

function estaOculto(elemento: HTMLElement): boolean {
  for (let actual: HTMLElement | null = elemento; actual; actual = actual.parentElement) {
    if (actual.style.display === 'none') return true;
  }
  return !elemento.isConnected;
}
