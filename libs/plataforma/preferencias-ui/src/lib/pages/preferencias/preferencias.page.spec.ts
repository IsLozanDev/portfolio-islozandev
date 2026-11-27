import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AvisosService, type ResultadoConfirmacionDestructiva } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { ErrorPreferencias, MENSAJES_PREFERENCIAS, type AlcanceBaja, type BajasDestino, type PreferenciasDestino } from '../../models/preferencias';
import { PreferenciasCliente } from '../../services/preferencias.cliente';
import { PreferenciasPage } from './preferencias.page';

const TOKEN = 'carga.firma';
const URL_CON_TOKEN = `/preferencias#t=${TOKEN}`;
const PREFERENCIAS: PreferenciasDestino = { destinoEnmascarado: 'j***@gmail.com', canal: 'CORREO', bajas: [] };

class DobleCliente {
  readonly consultar = vi.fn<(token: string) => Promise<PreferenciasDestino>>(async () => PREFERENCIAS);
  readonly darseDeBaja = vi.fn<(token: string, baja: AlcanceBaja) => Promise<BajasDestino>>(async (_token, baja) => ({ bajas: [baja] }));
}

class DobleAvisos {
  readonly confirmarDestructiva = vi.fn(async (): Promise<ResultadoConfirmacionDestructiva> => ({ confirmado: true, motivo: null }));
}

describe('PreferenciasPage (spec 46)', () => {
  let cliente: DobleCliente;
  let avisos: DobleAvisos;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    cliente = new DobleCliente();
    avisos = new DobleAvisos();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'preferencias', component: PreferenciasPage }]),
        { provide: PreferenciasCliente, useValue: cliente },
        { provide: AvisosService, useValue: avisos },
      ],
    });
  });

  async function abrir(url: string): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    await estable();
  }

  async function estable(): Promise<void> {
    await vi.waitFor(async () => {
      await harness.fixture.whenStable();
      if (elemento().querySelector('vit-cargando')) throw new Error('cargando');
    });
    harness.detectChanges();
  }

  const elemento = (): HTMLElement => harness.fixture.nativeElement as HTMLElement;
  const texto = (): string => elemento().textContent?.replace(/\s+/g, ' ') ?? '';
  const boton = (accion: string): HTMLButtonElement => {
    const encontrado = elemento().querySelector<HTMLButtonElement>(`button[data-accion="${accion}"]`);
    if (!encontrado) throw new Error(`Sin botón ${accion}`);
    return encontrado;
  };
  async function pulsar(accion: string): Promise<void> {
    boton(accion).click();
    await estable();
  }

  it('cargando: muestra vit-cargando mientras consulta', async () => {
    cliente.consultar.mockReturnValueOnce(new Promise(() => undefined));

    harness = await RouterTestingHarness.create(URL_CON_TOKEN);
    harness.detectChanges();

    expect(elemento().querySelector('vit-cargando')).not.toBeNull();
    expect(texto()).toContain('Revisando el enlace…');
  });

  it('lee el token del fragmento, lo consulta y lo quita de la barra', async () => {
    await abrir(URL_CON_TOKEN);

    expect(cliente.consultar).toHaveBeenCalledWith(TOKEN);
    expect(TestBed.inject(Router).url).toBe('/preferencias');
    expect(window.location.hash).not.toContain(TOKEN);
  });

  it('TR-CA-194: sin token o con el enlace inválido muestra «Enlace inválido o vencido» sin datos', async () => {
    cliente.consultar.mockRejectedValueOnce(new ErrorPreferencias('ENLACE_INVALIDO'));
    await abrir(URL_CON_TOKEN);

    expect(elemento().querySelector('vit-estado-vacio')?.textContent).toContain(MENSAJES_PREFERENCIAS.enlaceInvalido);
    expect(texto()).not.toContain('@');
    expect(elemento().querySelector('button')).toBeNull();
  });

  it('sin token no llama a la API', async () => {
    await abrir('/preferencias');

    expect(cliente.consultar).not.toHaveBeenCalled();
    expect(texto()).toContain(MENSAJES_PREFERENCIAS.enlaceInvalido);
  });

  it('preferencias: muestra el destino enmascarado y las dos acciones habilitadas', async () => {
    await abrir(URL_CON_TOKEN);

    expect(elemento().querySelector('[data-destino]')?.textContent).toBe('j***@gmail.com');
    expect(boton('promociones').disabled).toBe(false);
    expect(boton('todo-el-correo').disabled).toBe(false);
    expect(boton('todo-el-correo').classList).toContain('vit-destructivo');
  });

  it('una baja ya vigente se muestra hecha y su botón queda deshabilitado; CANAL cubre también las promociones', async () => {
    cliente.consultar.mockResolvedValueOnce({ ...PREFERENCIAS, bajas: ['PROMOCIONAL'] });
    await abrir(URL_CON_TOKEN);

    expect([boton('promociones').disabled, boton('promociones').textContent?.trim()]).toEqual([true, 'Ya no recibe promociones']);
    expect(boton('todo-el-correo').disabled).toBe(false);
  });

  it('con baja CANAL las dos acciones quedan deshabilitadas', async () => {
    cliente.consultar.mockResolvedValueOnce({ ...PREFERENCIAS, bajas: ['CANAL'] });
    await abrir(URL_CON_TOKEN);

    expect(boton('promociones').disabled).toBe(true);
    expect([boton('todo-el-correo').disabled, boton('todo-el-correo').textContent?.trim()]).toEqual([true, 'Ya no recibe correos']);
  });

  it('confirmación: dejar las promociones no pide confirmar y muestra el destino', async () => {
    await abrir(URL_CON_TOKEN);

    await pulsar('promociones');

    expect(cliente.darseDeBaja).toHaveBeenCalledWith(TOKEN, 'PROMOCIONAL');
    expect(avisos.confirmarDestructiva).not.toHaveBeenCalled();
    expect(texto()).toContain('Listo');
    expect(texto()).toContain('Ya no recibirá promociones en j***@gmail.com.');
  });

  it('dejar todo el correo se confirma con el aviso de recordatorios y comprobantes', async () => {
    await abrir(URL_CON_TOKEN);

    await pulsar('todo-el-correo');

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ texto: expect.stringContaining('recordatorios de citas y comprobantes') }));
    expect(cliente.darseDeBaja).toHaveBeenCalledWith(TOKEN, 'CANAL');
    expect(texto()).toContain('Ya no recibirá correos en j***@gmail.com.');
  });

  it('si cancela la confirmación no se da de baja', async () => {
    avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
    await abrir(URL_CON_TOKEN);

    await pulsar('todo-el-correo');

    expect(cliente.darseDeBaja).not.toHaveBeenCalled();
    expect(boton('todo-el-correo').disabled).toBe(false);
  });

  it('un error de la baja que no es del enlace se muestra como alerta y deja reintentar', async () => {
    cliente.darseDeBaja.mockRejectedValueOnce(new ErrorPreferencias('DEMASIADAS_SOLICITUDES'));
    await abrir(URL_CON_TOKEN);

    await pulsar('promociones');

    expect(elemento().querySelector('[role=alert]')?.textContent?.trim()).toBe(MENSAJES_PREFERENCIAS.demasiadasSolicitudes);
    expect(boton('promociones').disabled).toBe(false);
  });

  it('si el enlace vence entre la consulta y la baja pasa al estado inválido', async () => {
    cliente.darseDeBaja.mockRejectedValueOnce(new ErrorPreferencias('ENLACE_INVALIDO'));
    await abrir(URL_CON_TOKEN);

    await pulsar('promociones');

    expect(texto()).toContain(MENSAJES_PREFERENCIAS.enlaceInvalido);
    expect(elemento().querySelector('[data-destino]')).toBeNull();
  });
});
