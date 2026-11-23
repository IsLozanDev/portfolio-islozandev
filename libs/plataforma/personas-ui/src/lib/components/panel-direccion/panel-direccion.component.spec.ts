import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { referenciaDialogoDePrueba } from '../../../testing/dialogo-de-prueba';
import { estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import type { Ubigeo } from '../../models/ubigeo';
import { DireccionesCliente } from '../../services/direcciones.cliente';
import { UbigeosService } from '../../services/ubigeos.service';
import { PanelDireccionComponent, type DatosPanelDireccion } from './panel-direccion.component';

const CAYMA: Ubigeo = { codigo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const MIRAFLORES_AQP: Ubigeo = { codigo: '040110', distrito: 'MIRAFLORES', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const MIRAFLORES_LIMA: Ubigeo = { codigo: '150122', distrito: 'MIRAFLORES', provincia: 'LIMA', departamento: 'LIMA' };

describe('PanelDireccionComponent con vit-ubigeo-autocompletar', () => {
  let fixture: ComponentFixture<PanelDireccionComponent>;
  let cerrar: ReturnType<typeof vi.fn>;
  let direcciones: { agregar: ReturnType<typeof vi.fn>; editar: ReturnType<typeof vi.fn> };

  function montar(datos: DatosPanelDireccion): void {
    const dialogo = referenciaDialogoDePrueba();
    cerrar = dialogo.referencia.close;
    direcciones = { agregar: vi.fn(async () => FICHA_DE_PRUEBA), editar: vi.fn(async () => FICHA_DE_PRUEBA) };
    const ubigeos = { ubigeos: signal([CAYMA, MIRAFLORES_AQP, MIRAFLORES_LIMA]), estado: signal('LISTO'), listos: signal(true), cargar: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        dialogo.proveedor,
        { provide: MAT_DIALOG_DATA, useValue: datos },
        { provide: DireccionesCliente, useValue: direcciones },
        { provide: UbigeosService, useValue: ubigeos },
      ],
    });
    fixture = TestBed.createComponent(PanelDireccionComponent);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;
  const campo = (nombre: string) => elemento().querySelector<HTMLInputElement>(`[data-campo="${nombre}"]`) as HTMLInputElement;

  function escribir(nombre: string, valor: string): void {
    const input = campo(nombre);
    input.focus();
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  const opciones = () => Array.from(document.querySelectorAll<HTMLElement>('[data-prueba="opcion-ubigeo"]'));

  async function enviar(): Promise<void> {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await estable(fixture);
  }

  it('TR-CA-105: «cayma» ofrece «AREQUIPA / AREQUIPA / CAYMA»; al elegirla se guarda con el código del ubigeo', async () => {
    montar({ persona: FICHA_DE_PRUEBA });
    escribir('direccion', 'Av. Ejército 710');
    escribir('ubigeo', 'cayma');
    await estable(fixture);

    expect(opciones().map((opcion) => opcion.textContent?.trim())).toEqual(['AREQUIPA / AREQUIPA / CAYMA']);
    opciones()[0]?.click();
    fixture.detectChanges();
    expect(campo('ubigeo').value).toBe('AREQUIPA / AREQUIPA / CAYMA');

    (elemento().querySelector('[data-campo="principal"] input') as HTMLInputElement).click();
    fixture.detectChanges();
    await enviar();
    expect(direcciones.agregar).toHaveBeenCalledWith('per-1', { direccion: 'Av. Ejército 710', referencia: null, ubigeo: '040103', principal: true });
    expect(cerrar).toHaveBeenCalledWith({ tipo: 'guardada', persona: FICHA_DE_PRUEBA });
  });

  it('un distrito repetido sale con su departamento para elegir', async () => {
    montar({ persona: FICHA_DE_PRUEBA });
    escribir('ubigeo', 'miraflores');
    await estable(fixture);

    expect(opciones().map((opcion) => opcion.textContent?.trim())).toEqual(['AREQUIPA / AREQUIPA / MIRAFLORES', 'LIMA / LIMA / MIRAFLORES']);
  });

  it('lo escrito sin elegir de la lista no se envía', async () => {
    montar({ persona: FICHA_DE_PRUEBA });
    escribir('direccion', 'Av. Ejército 710');
    escribir('ubigeo', 'cayma');
    await enviar();

    expect(direcciones.agregar).not.toHaveBeenCalled();
    expect(elemento().textContent).toContain('Elige un distrito de la lista');
  });

  it('editar llega con la dirección y su ubigeo elegidos, y manda la versión', async () => {
    montar({ persona: FICHA_DE_PRUEBA, direccion: FICHA_DE_PRUEBA.direcciones[0] });
    await estable(fixture);
    expect(campo('ubigeo').value).toBe('AREQUIPA / AREQUIPA / CAYMA');
    escribir('referencia', '');
    await enviar();

    expect(direcciones.editar).toHaveBeenCalledWith('per-1', 'd1', {
      version: 5,
      direccion: 'Av. Ejército 710',
      referencia: null,
      ubigeo: '040103',
      principal: true,
    });
  });
});
