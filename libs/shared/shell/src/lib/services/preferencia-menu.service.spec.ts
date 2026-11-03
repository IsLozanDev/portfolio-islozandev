import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CLAVE_MENU_COLAPSADO, PreferenciaMenuService } from './preferencia-menu.service';

describe('PreferenciaMenuService', () => {
  const crear = () => TestBed.inject(PreferenciaMenuService);

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('sin valor guardado arranca visible', () => {
    expect(crear().colapsado()).toBe(false);
  });

  it('con "true" guardado arranca oculto', () => {
    localStorage.setItem(CLAVE_MENU_COLAPSADO, 'true');
    expect(crear().colapsado()).toBe(true);
  });

  it('con un valor desconocido arranca visible', () => {
    localStorage.setItem(CLAVE_MENU_COLAPSADO, 'quizas');
    expect(crear().colapsado()).toBe(false);
  });

  it('alternar cambia el estado y lo guarda', () => {
    const servicio = crear();

    servicio.alternar();
    expect(servicio.colapsado()).toBe(true);
    expect(localStorage.getItem(CLAVE_MENU_COLAPSADO)).toBe('true');

    servicio.alternar();
    expect(servicio.colapsado()).toBe(false);
    expect(localStorage.getItem(CLAVE_MENU_COLAPSADO)).toBe('false');
  });

  it('mostrar deja el menú visible y no escribe si ya lo estaba', () => {
    localStorage.setItem(CLAVE_MENU_COLAPSADO, 'true');
    const servicio = crear();

    servicio.mostrar();
    expect(servicio.colapsado()).toBe(false);
    expect(localStorage.getItem(CLAVE_MENU_COLAPSADO)).toBe('false');

    const escribir = vi.spyOn(Storage.prototype, 'setItem');
    servicio.mostrar();
    expect(escribir).not.toHaveBeenCalled();
  });

  it('con localStorage que lanza error arranca visible y alterna en memoria', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    const servicio = crear();

    expect(servicio.colapsado()).toBe(false);
    expect(() => servicio.alternar()).not.toThrow();
    expect(servicio.colapsado()).toBe(true);
  });
});
