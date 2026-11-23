import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { cambiosDe, dependenciasDeFicha, estable } from '../../../testing/ficha-de-prueba';
import { FICHA_DE_PRUEBA } from '../../../testing/persona-de-prueba';
import type { CambioFicha } from '../../models/ficha';
import { DireccionesCliente } from '../../services/direcciones.cliente';
import { PersonaDireccionesComponent } from './persona-direcciones.component';

const EDITAR = 'plat.persona.editar';
const LEER_CATALOGOS = 'plat.catalogo.leer';

describe('PersonaDireccionesComponent', () => {
  let fixture: ComponentFixture<PersonaDireccionesComponent>;
  let direcciones: { editar: ReturnType<typeof vi.fn>; eliminar: ReturnType<typeof vi.fn> };
  let cambios: CambioFicha[];

  function montar(permisos: string[]): void {
    const dobles = dependenciasDeFicha(new Set(permisos));
    direcciones = { editar: vi.fn(async () => FICHA_DE_PRUEBA), eliminar: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({ providers: [...dobles.proveedores, { provide: DireccionesCliente, useValue: direcciones }] });
    fixture = TestBed.createComponent(PersonaDireccionesComponent);
    fixture.componentRef.setInput('persona', FICHA_DE_PRUEBA);
    cambios = cambiosDe(fixture);
    fixture.detectChanges();
  }

  const elemento = () => fixture.nativeElement as HTMLElement;
  const boton = (accion: string) => elemento().querySelector<HTMLButtonElement>(`[data-accion="${accion}"]`);

  it('TR-CA-105: el ubigeo sale como «AREQUIPA / AREQUIPA / CAYMA»; sin referencia, una raya', () => {
    montar([EDITAR, LEER_CATALOGOS]);
    const texto = elemento().textContent ?? '';
    expect(texto).toContain('Av. Ejército 710');
    expect(texto).toContain('AREQUIPA / AREQUIPA / CAYMA');
    expect(texto).toContain('—');
  });

  it('sin plat.catalogo.leer, «Agregar dirección» está deshabilitado con su aviso', () => {
    montar([EDITAR]);
    expect(boton('agregar-direccion')?.disabled).toBe(true);
    expect(elemento().querySelector('[data-prueba="sin-catalogo"]')?.textContent).toContain('Necesita permiso para leer catálogos');
    expect(boton('editar-direccion')).toBeNull();
  });

  it('marcar principal otra dirección envía la versión', async () => {
    montar([EDITAR, LEER_CATALOGOS]);
    boton('marcar-principal-direccion')?.click();
    await estable(fixture);

    expect(direcciones.editar).toHaveBeenCalledWith('per-1', 'd2', { version: 5, principal: true });
    expect(cambios).toEqual([{ tipo: 'actualizada', persona: FICHA_DE_PRUEBA }]);
  });

  it('sin plat.persona.editar no hay acciones', () => {
    montar([LEER_CATALOGOS]);
    expect(boton('agregar-direccion')).toBeNull();
    expect(boton('eliminar-direccion')).toBeNull();
  });
});
