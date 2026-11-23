import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PanelNuevaPersonaComponent, PersonasCliente, type ListadoPersonas, type PersonaListada, type ResultadoNuevaPersona } from '@vitrina/plataforma/personas-ui';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService, PanelLateralService } from '@vitrina/shared/ui';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { PersonasListaPage } from './personas-lista.page';

const JUANA: PersonaListada = {
  id: 'per-juana',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  denominacion: 'Quispe Mamani, Juana',
  celularPrincipal: '987654321',
  correoPrincipal: null,
  roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE' }],
  coincidencia: null,
};
const ROSA: PersonaListada = { ...JUANA, id: 'per-rosa', numeroDocumento: '40236718', denominacion: 'Valdivieso Chávez, Rosa', roles: [], coincidencia: 'NOMBRE' };

@Component({ selector: 'vit-destino-personas', template: '' })
class Destino {}

describe('PersonasListaPage', () => {
  let harness: RouterTestingHarness;
  let sesion: DobleSesion;
  let listar: ReturnType<typeof vi.fn>;
  let panel: { abrir: ReturnType<typeof vi.fn>; resultado: ResultadoNuevaPersona | undefined };
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string, listado: ListadoPersonas = { items: [JUANA], total: 1, pagina: 1, tamano: 20 }): Promise<void> {
    listar = vi.fn(async () => listado);
    panel = { resultado: undefined, abrir: vi.fn() };
    panel.abrir.mockImplementation(() => ({ afterClosed: () => of(panel.resultado) }));
    avisos = { toast: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', children: [{ path: 'personas', component: PersonasListaPage }, { path: 'personas/:personaId', component: Destino }] },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: PersonasCliente, useValue: { listar, observarListado: vi.fn(), observarBusquedaDocumento: vi.fn() } },
        { provide: PanelLateralService, useValue: panel },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    harness = await RouterTestingHarness.create(ruta);
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos('plat.persona.leer', 'plat.persona.registrar');
  });

  it('lista con denominación, documento, celular y roles, y cada persona enlaza a su ficha', async () => {
    await abrir('/admin/personas');

    expect(listar).toHaveBeenCalledWith({ q: undefined, tipoPersona: undefined, producto: undefined, rol: undefined, pagina: 1, tamano: 20 });
    const texto = elemento().textContent ?? '';
    expect(texto).toContain('Quispe Mamani, Juana');
    expect(texto).toContain('DNI 45781236');
    expect(texto).toContain('987 654 321');
    expect(texto).toContain('CLI · Paciente');
    expect(texto).not.toContain('Coincide por');
    expect(elemento().querySelector('[data-accion="abrir-ficha"]')?.getAttribute('href')).toBe('/admin/personas/per-juana');
    // En celular vit-tabla pinta el nombre como texto: la fila lleva además su enlace a la ficha.
    const enlaceFila = elemento().querySelector('[data-accion="abrir-ficha-fila"]');
    expect([enlaceFila?.getAttribute('href'), enlaceFila?.getAttribute('aria-label')]).toEqual(['/admin/personas/per-juana', 'Abrir la ficha de Quispe Mamani, Juana']);
  });

  it('los filtros de la URL llegan a la API y la búsqueda muestra la columna de coincidencia', async () => {
    await abrir('/admin/personas?q=baldiviezo&producto=CLI&rol=PACIENTE&pagina=2', { items: [ROSA], total: 21, pagina: 2, tamano: 20 });

    expect(listar).toHaveBeenCalledWith({ q: 'baldiviezo', tipoPersona: undefined, producto: 'CLI', rol: 'PACIENTE', pagina: 2, tamano: 20 });
    expect(elemento().textContent).toContain('Coincide por');
    expect(elemento().textContent).toContain('Nombre');
    expect((elemento().querySelector('[data-campo="buscador"]') as HTMLInputElement).value).toBe('baldiviezo');
  });

  it('elegir un filtro lo pone en la URL y vuelve a la primera página', async () => {
    await abrir('/admin/personas?pagina=3');
    (elemento().querySelector('[data-filtro="tipo"] .mat-mdc-select-trigger') as HTMLElement).click();
    harness.detectChanges();
    Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find((opcion) => opcion.textContent?.trim() === 'Persona jurídica')?.click();
    await estable();

    expect(url()).toBe('/admin/personas?tipo=JURIDICA');
    expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ tipoPersona: 'JURIDICA', pagina: 1 }));
  });

  it('«Nueva persona» abre el panel con «Abrir ficha»; al registrar avisa y va a la ficha', async () => {
    await abrir('/admin/personas');
    panel.resultado = { personaId: 'per-nueva', registrada: true };
    (elemento().querySelector('[data-accion="nueva-persona"]') as HTMLButtonElement).click();
    await estable();

    expect(panel.abrir).toHaveBeenCalledWith(PanelNuevaPersonaComponent, { datos: { etiquetaUsar: 'Abrir ficha' } });
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Persona registrada');
    expect(url()).toBe('/admin/personas/per-nueva');
  });

  it('elegir una persona existente en el panel va a su ficha sin avisar registro', async () => {
    await abrir('/admin/personas');
    panel.resultado = { personaId: 'per-juana', registrada: false };
    (elemento().querySelector('[data-accion="nueva-persona"]') as HTMLButtonElement).click();
    await estable();

    expect(avisos.toast).not.toHaveBeenCalled();
    expect(url()).toBe('/admin/personas/per-juana');
  });

  it('sin plat.persona.registrar no se ve «Nueva persona»', async () => {
    sesion.conPermisos('plat.persona.leer');
    await abrir('/admin/personas');
    expect(elemento().querySelector('[data-accion="nueva-persona"]')).toBeNull();
  });

  it('sin resultados lo dice', async () => {
    await abrir('/admin/personas?q=zevallos', { items: [], total: 0, pagina: 1, tamano: 20 });
    expect(elemento().textContent).toContain('No hay personas que coincidan');
  });
});
