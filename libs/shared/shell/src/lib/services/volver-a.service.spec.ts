import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { ORIGENES_VOLVER_A } from '../config/volver-a.config';
import { CLAVE_ALMACEN_VOLVER_A, VolverAService } from './volver-a.service';

@Component({ selector: 'vit-pagina-volver-a', template: '' })
class Pagina {}

const CONSOLA = 'http://consola.vitrina.test:4201';
const URL_TENANTS = `${CONSOLA}/consola/tenants`;

describe('VolverAService (U-06)', () => {
  function crear(): { servicio: VolverAService; router: Router } {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Pagina }]), { provide: ORIGENES_VOLVER_A, useValue: { [CONSOLA]: 'Consola de plataforma' } }],
    });
    return { servicio: TestBed.inject(VolverAService), router: TestBed.inject(Router) };
  }

  const entrar = (router: Router, volverA: string) => router.navigateByUrl(`/admin/usuarios?volverA=${encodeURIComponent(volverA)}`);

  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('un volverA de la lista blanca da el destino con el nombre de la app y se guarda en sessionStorage', async () => {
    const { servicio, router } = crear();
    await entrar(router, URL_TENANTS);

    expect(servicio.destino()).toEqual({ url: URL_TENANTS, nombreApp: 'Consola de plataforma' });
    expect(sessionStorage.getItem(CLAVE_ALMACEN_VOLVER_A)).toBe(URL_TENANTS);
  });

  it('un volverA ajeno no da destino ni cambia el guardado', async () => {
    const { servicio, router } = crear();
    await entrar(router, URL_TENANTS);
    await entrar(router, 'https://malo.test/');

    expect(servicio.destino()?.url).toBe(URL_TENANTS);
  });

  it('sin destino previo, un volverA ajeno no muestra nada', async () => {
    const { servicio, router } = crear();
    await entrar(router, 'https://malo.test/');

    expect(servicio.destino()).toBeNull();
    expect(sessionStorage.getItem(CLAVE_ALMACEN_VOLVER_A)).toBeNull();
  });

  it('al recargar la página restaura el destino guardado', () => {
    sessionStorage.setItem(CLAVE_ALMACEN_VOLVER_A, URL_TENANTS);
    expect(crear().servicio.destino()).toEqual({ url: URL_TENANTS, nombreApp: 'Consola de plataforma' });
  });

  it('un valor guardado que ya no está en la lista blanca se ignora', () => {
    sessionStorage.setItem(CLAVE_ALMACEN_VOLVER_A, 'https://malo.test/');
    expect(crear().servicio.destino()).toBeNull();
  });

  it('limpiar borra el destino y el almacén', async () => {
    const { servicio, router } = crear();
    await entrar(router, URL_TENANTS);
    servicio.limpiar();

    expect(servicio.destino()).toBeNull();
    expect(sessionStorage.getItem(CLAVE_ALMACEN_VOLVER_A)).toBeNull();
  });

  it('un sessionStorage que lanza no rompe: el enlace queda en memoria', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { servicio, router } = crear();
    await entrar(router, URL_TENANTS);

    expect(servicio.destino()?.url).toBe(URL_TENANTS);
  });
});
