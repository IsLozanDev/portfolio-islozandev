import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { SesionService, type SesionSoporte } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { contextoDePrueba, DobleSesion } from '../../../testing/pagina-de-prueba';
import { MENSAJES_SHELL } from '../../models/mensajes-shell';
import { BannerSoporteComponent } from './banner-soporte.component';

@Component({ template: '' })
class Inicio {}

const AHORA = new Date('2026-11-04T19:30:00Z');
const soporte = (cambios: Partial<SesionSoporte> = {}): SesionSoporte => ({
  accesoId: 'a-1',
  ticket: 'SOP-000245',
  modo: 'LECTURA',
  hasta: new Date('2026-11-04T21:30:00Z'),
  ...cambios,
});

describe('BannerSoporteComponent', () => {
  let fixture: ComponentFixture<BannerSoporteComponent>;
  let sesion: DobleSesion;
  const toast = vi.fn();

  async function montar(sesionSoporte: SesionSoporte | null): Promise<HTMLElement> {
    sesion = new DobleSesion();
    sesion.contexto.set(contextoDePrueba({ soporte: sesionSoporte }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Inicio }]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: { toast } },
      ],
    });
    fixture = TestBed.createComponent(BannerSoporteComponent);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(AHORA);
    toast.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('sin soporte vigente no pinta nada', async () => {
    const elemento = await montar(null);
    expect(elemento.querySelector('[role="status"]')).toBeNull();
  });

  it('con soporte vigente muestra ticket, modo y hora de fin en Lima, como estado', async () => {
    const elemento = await montar(soporte());

    const franja = elemento.querySelector('[role="status"]');
    expect(franja?.textContent).toContain(MENSAJES_SHELL.sesionSoporte);
    expect(franja?.textContent).toContain('Ticket SOP-000245');
    expect(franja?.textContent).toContain('Solo lectura');
    expect(franja?.textContent).toContain('Termina a las 16:30');
    expect(franja?.classList).toContain('bg-chip-advertencia');
  });

  it('en modo ESCRITURA dice «Lectura y escritura»', async () => {
    const elemento = await montar(soporte({ modo: 'ESCRITURA' }));
    expect(elemento.textContent).toContain('Lectura y escritura');
  });

  it('«Salir de soporte» sale, avisa y vuelve al inicio', async () => {
    const elemento = await montar(soporte());
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    elemento.querySelector<HTMLButtonElement>('[data-accion="salir-de-soporte"]')?.click();
    await vi.runAllTimersAsync();

    expect(sesion.salirDeSoporte).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('info', MENSAJES_SHELL.saliDeSoporte);
    expect(navegar).toHaveBeenCalledWith('/');
  });

  it('si salir falla avisa el error y no navega', async () => {
    const elemento = await montar(soporte());
    sesion.salirDeSoporte.mockRejectedValueOnce(new Error('sin conexión'));
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    elemento.querySelector<HTMLButtonElement>('[data-accion="salir-de-soporte"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(toast).toHaveBeenCalledWith('error', MENSAJES_SHELL.errorSalirDeSoporte);
    expect(navegar).not.toHaveBeenCalled();
  });

  it('al llegar hasta refresca la sesión sola y avisa que terminó', async () => {
    await montar(soporte());

    await vi.advanceTimersByTimeAsync(2 * 3_600_000 - 1);
    expect(sesion.refrescarSesion).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(sesion.refrescarSesion).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('info', MENSAJES_SHELL.soporteTermino);
  });

  it('si el refresh falla al vencer, igual recarga el contexto para apagar el banner', async () => {
    await montar(soporte({ hasta: new Date(AHORA.getTime() + 1000) }));
    sesion.refrescarSesion.mockRejectedValueOnce(new Error('token vencido'));

    await vi.advanceTimersByTimeAsync(1000);

    expect(sesion.intentarCargarContexto).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('info', MENSAJES_SHELL.soporteTermino);
  });

  it('al dejar de haber soporte cancela el temporizador', async () => {
    await montar(soporte());
    sesion.contexto.set(contextoDePrueba({ soporte: null }));
    await fixture.whenStable();

    await vi.advanceTimersByTimeAsync(3 * 3_600_000);
    expect(sesion.refrescarSesion).not.toHaveBeenCalled();
  });
});
