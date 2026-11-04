import { ATRIBUTO_TEMA, CLAVE_TEMA, CONSULTA_OSCURO } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import indexHtml from './index.html' with { loader: 'text' };

const scriptAntiParpadeo = (): string => {
  const script = new DOMParser().parseFromString(indexHtml, 'text/html').head.querySelector('script:not([src])');
  return script?.textContent ?? '';
};

describe('script anti-parpadeo de index.html', () => {
  const ejecutar = (sistemaOscuro: boolean) => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta === CONSULTA_OSCURO && sistemaOscuro }));
    new Function(scriptAntiParpadeo())();
    return document.documentElement.getAttribute(ATRIBUTO_TEMA);
  };

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(ATRIBUTO_TEMA);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('usa la misma clave, atributo y consulta que TemaService', () => {
    const script = scriptAntiParpadeo();
    expect(script).toContain(`'${CLAVE_TEMA}'`);
    expect(script).toContain(`'${ATRIBUTO_TEMA}'`);
    expect(script).toContain(`'${CONSULTA_OSCURO}'`);
  });

  it('aplica la preferencia guardada aunque el sistema diga otra cosa', () => {
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    expect(ejecutar(false)).toBe('oscuro');
  });

  it('sin preferencia válida sigue al sistema', () => {
    localStorage.setItem(CLAVE_TEMA, 'azul');
    expect(ejecutar(true)).toBe('oscuro');
  });
});
