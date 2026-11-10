import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { EstadoFranja, VerificacionIntegridad } from '../../models/verificacion-integridad';
import { FranjaIntegridadComponent } from './franja-integridad.component';

const OK: VerificacionIntegridad = {
  estado: 'OK',
  modo: 'INCREMENTAL',
  hastaNumero: '18412',
  numeroRoto: null,
  motivo: null,
  terminadaEn: new Date('2026-11-10T08:30:04Z'),
};
const ROTA: VerificacionIntegridad = { ...OK, estado: 'ROTA', hastaNumero: '17905', numeroRoto: '17906', motivo: 'HASH' };

@Component({
  imports: [FranjaIntegridadComponent],
  template: '<vit-franja-integridad [estado]="estado()" />',
})
class Anfitrion {
  readonly estado = signal<EstadoFranja>({ tipo: 'cargando' });
}

describe('FranjaIntegridadComponent (spec 20c)', () => {
  let fixture: ComponentFixture<Anfitrion>;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const franja = () => elemento().querySelector<HTMLElement>('[data-franja]');
  const pintar = (estado: EstadoFranja) => {
    fixture.componentInstance.estado.set(estado);
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
  });

  it.each<[string, EstadoFranja]>([
    ['cargando', { tipo: 'cargando' }],
    ['oculta (403 o error)', { tipo: 'oculta' }],
  ])('%s no pinta nada', (_caso, estado) => {
    pintar(estado);
    expect(franja()).toBeNull();
  });

  it('OK: fecha de la verificación en Lima, eventos verificados e ícono verified', () => {
    pintar({ tipo: 'verificada', verificacion: OK });
    expect(franja()?.dataset['franja']).toBe('ok');
    expect(franja()?.textContent).toContain('Cadena verificada el 10/11/26, 3:30');
    expect(franja()?.textContent).toContain('18412 eventos');
    expect(franja()?.querySelector('mat-icon')?.textContent).toBe('verified');
    expect(franja()?.getAttribute('role')).toBeNull();
  });

  it('ROTA: alerta destructiva con el número roto y el motivo legible', () => {
    pintar({ tipo: 'verificada', verificacion: ROTA });
    expect(franja()?.dataset['franja']).toBe('rota');
    expect(franja()?.getAttribute('role')).toBe('alert');
    expect(franja()?.classList).toContain('vit-destructivo');
    expect(franja()?.textContent).toContain('Cadena rota en el evento N.º 17906');
    expect(franja()?.textContent).toContain('el contenido no coincide con su hash');
    expect(franja()?.querySelector('mat-icon')?.textContent).toBe('gpp_bad');
  });

  it('sin verificaciones: aviso neutro', () => {
    pintar({ tipo: 'sin-verificar' });
    expect(franja()?.dataset['franja']).toBe('sin-verificar');
    expect(franja()?.textContent).toContain('La cadena aún no se ha verificado');
    expect(franja()?.querySelector('mat-icon')?.textContent).toBe('schedule');
  });
});
