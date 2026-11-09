import { Component, inject } from '@angular/core';
import type { MockInstance } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { PanelLateralComponent } from '../components/panel-lateral/panel-lateral.component';
import { CLASE_FONDO_PANEL_LATERAL, CLASE_PANEL_LATERAL } from '../models/panel-lateral';
import { PanelLateralService } from './panel-lateral.service';

interface DatosDePrueba {
  nombre: string;
}

@Component({
  imports: [PanelLateralComponent],
  template: `
    <form>
      <vit-panel-lateral titulo="Nuevo feriado">
        <input id="nombre" />
        <div accionesPanel><button id="cancelar" type="button" (click)="referencia.close()">Cancelar</button></div>
      </vit-panel-lateral>
    </form>
  `,
})
class FormularioDePrueba {
  protected readonly referencia = inject(MatDialogRef);
}

@Component({
  template: '<button id="abrir" type="button" (click)="abrir()">Nuevo</button>',
})
class Anfitrion {
  private readonly paneles = inject(PanelLateralService);
  referencia: MatDialogRef<FormularioDePrueba, string> | null = null;

  abrir(): void {
    this.referencia = this.paneles.abrir<FormularioDePrueba, DatosDePrueba, string>(FormularioDePrueba, { datos: { nombre: 'Inti Raymi' } });
  }
}

function elemento<T extends Element>(selector: string): T {
  const encontrado = document.querySelector<T>(selector);
  if (!encontrado) throw new Error(`No está ${selector}`);
  return encontrado;
}

async function esperarCierre(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector(`.${CLASE_PANEL_LATERAL}`)).toBeNull());
}

function pulsarEscape(): void {
  elemento('mat-dialog-container').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('PanelLateralService', () => {
  let anfitrion: Anfitrion;
  let abrir: HTMLButtonElement;
  let espiaAbrir: MockInstance<MatDialog['open']>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    espiaAbrir = vi.spyOn(TestBed.inject(MatDialog), 'open');
    const fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    await fixture.whenStable();
    abrir = fixture.nativeElement.querySelector('#abrir');
    abrir.focus();
    abrir.click();
    await fixture.whenStable();
  });

  afterEach(async () => {
    anfitrion.referencia?.close();
    await esperarCierre();
  });

  it('abre a la derecha con panelClass vit-panel-lateral, su fondo y disableClose', () => {
    expect(elemento(`.cdk-overlay-pane.${CLASE_PANEL_LATERAL}`)).toBeTruthy();
    expect(espiaAbrir.mock.calls[0][1]).toMatchObject({
      data: { nombre: 'Inti Raymi' },
      position: { right: '0' },
      width: 'min(480px, 100vw)',
      height: '100dvh',
      maxWidth: '100vw',
      disableClose: true,
      restoreFocus: true,
    });
    expect(elemento(`.${CLASE_FONDO_PANEL_LATERAL}`)).toBeTruthy();
    expect(anfitrion.referencia?.disableClose).toBe(true);
    expect(elemento('h2').textContent?.trim()).toBe('Nuevo feriado');
  });

  it('el foco va al primer campo del cuerpo, no a la X', async () => {
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('nombre'));
  });

  it('Esc cierra el panel', async () => {
    pulsarEscape();
    await esperarCierre();
  });

  it('la X cierra el panel', async () => {
    elemento<HTMLButtonElement>('button[aria-label="Cerrar"]').click();
    await esperarCierre();
  });

  it('«Cancelar» del contenido cierra el panel', async () => {
    elemento<HTMLButtonElement>('#cancelar').click();
    await esperarCierre();
  });

  it('un clic en el fondo no lo cierra', async () => {
    elemento<HTMLElement>(`.${CLASE_FONDO_PANEL_LATERAL}`).click();
    await new Promise((resolver) => setTimeout(resolver));
    expect(document.querySelector(`.${CLASE_PANEL_LATERAL}`)).not.toBeNull();
  });

  it('al cerrar, el foco vuelve al botón que lo abrió', async () => {
    pulsarEscape();
    await esperarCierre();
    await vi.waitFor(() => expect(document.activeElement).toBe(abrir));
  });
});
