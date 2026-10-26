import { TestBed } from '@angular/core/testing';
import { CONFIG_AUTH, resolverConfigAuth } from './config';
import { opcionesCookie, SupabaseCliente } from './supabase.cliente';
import { CONFIG_DE_PRUEBA } from '../testing/doble-supabase';

describe('opcionesCookie', () => {
  it('lleva secure solo en https:', () => {
    expect(opcionesCookie('https:', undefined).secure).toBe(true);
    expect(opcionesCookie('http:', undefined).secure).toBe(false);
  });

  it('lleva domain solo si se configura dominioCookie', () => {
    expect(opcionesCookie('https:', undefined)).not.toHaveProperty('domain');
    expect(opcionesCookie('https:', '.vitrina.pe').domain).toBe('.vitrina.pe');
  });

  it('usa sameSite lax y path /', () => {
    expect(opcionesCookie('https:', undefined)).toMatchObject({ sameSite: 'lax', path: '/' });
  });
});

describe('SupabaseCliente', () => {
  it('no inicializa al construirse y lo hace una sola vez a pedido', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: CONFIG_AUTH, useValue: resolverConfigAuth(CONFIG_DE_PRUEBA) }] });
    const cliente = TestBed.inject(SupabaseCliente);
    const initialize = vi.spyOn(cliente.auth, 'initialize').mockResolvedValue({ error: null });

    await Promise.all([cliente.inicializar(), cliente.inicializar()]);

    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
