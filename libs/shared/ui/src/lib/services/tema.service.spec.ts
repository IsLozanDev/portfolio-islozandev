import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ATRIBUTO_TEMA, CLAVE_TEMA, CONSULTA_OSCURO } from '../models/tema';
import { TemaService } from './tema.service';

class ConsultaFalsa extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }

  cambiarSistema(oscuro: boolean): void {
    this.matches = oscuro;
    this.dispatchEvent(Object.assign(new Event('change'), { matches: oscuro }));
  }
}

describe('TemaService', () => {
  let consulta: ConsultaFalsa;

  const simularSistema = (oscuro: boolean) => {
    consulta = new ConsultaFalsa(oscuro);
    vi.spyOn(window, 'matchMedia').mockImplementation((texto: string) => {
      expect(texto).toBe(CONSULTA_OSCURO);
      return consulta as unknown as MediaQueryList;
    });
  };

  const crear = () => {
    const servicio = TestBed.inject(TemaService);
    TestBed.tick();
    return servicio;
  };

  const atributoEnHtml = () => document.documentElement.getAttribute(ATRIBUTO_TEMA);

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute(ATRIBUTO_TEMA);
    window.matchMedia ??= (() => undefined) as unknown as typeof window.matchMedia;
    simularSistema(false);
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin valor guardado la preferencia es sistema y sigue al sistema', () => {
    simularSistema(true);
    const servicio = crear();

    expect(servicio.preferencia()).toBe('sistema');
    expect(servicio.efectivo()).toBe('oscuro');
  });

  it('con un valor guardado arranca con esa preferencia', () => {
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    const servicio = crear();

    expect(servicio.preferencia()).toBe('oscuro');
    expect(servicio.efectivo()).toBe('oscuro');
  });

  it('un valor guardado inválido se trata como sistema', () => {
    localStorage.setItem(CLAVE_TEMA, 'azul');
    const servicio = crear();

    expect(servicio.preferencia()).toBe('sistema');
    expect(servicio.efectivo()).toBe('claro');
  });

  it('con localStorage que lanza error sigue al sistema y elige en memoria', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    const servicio = crear();

    expect(servicio.preferencia()).toBe('sistema');
    expect(() => servicio.elegir('oscuro')).not.toThrow();
    expect(servicio.efectivo()).toBe('oscuro');
  });

  it('elegir guarda la preferencia', () => {
    const servicio = crear();

    servicio.elegir('claro');

    expect(servicio.preferencia()).toBe('claro');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('claro');
  });

  it('con sistema, un cambio del sistema cambia el tema efectivo', () => {
    const servicio = crear();

    consulta.cambiarSistema(true);
    expect(servicio.efectivo()).toBe('oscuro');

    consulta.cambiarSistema(false);
    expect(servicio.efectivo()).toBe('claro');
  });

  it('sin sistema, deja de escuchar los cambios del sistema', () => {
    const servicio = crear();

    servicio.elegir('claro');
    TestBed.tick();
    consulta.cambiarSistema(true);

    expect(servicio.efectivo()).toBe('claro');
  });

  it('al volver a sistema toma el valor actual del sistema', () => {
    const servicio = crear();
    servicio.elegir('claro');
    TestBed.tick();
    consulta.cambiarSistema(true);

    servicio.elegir('sistema');
    TestBed.tick();

    expect(servicio.efectivo()).toBe('oscuro');
  });

  it('escribe el tema efectivo en <html>', () => {
    const servicio = crear();
    expect(atributoEnHtml()).toBe('claro');

    servicio.elegir('oscuro');
    TestBed.tick();
    expect(atributoEnHtml()).toBe('oscuro');

    servicio.elegir('sistema');
    TestBed.tick();
    consulta.cambiarSistema(true);
    TestBed.tick();
    expect(atributoEnHtml()).toBe('oscuro');
  });
});
