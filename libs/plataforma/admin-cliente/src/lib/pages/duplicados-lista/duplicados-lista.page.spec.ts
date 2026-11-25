import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DuplicadosCliente, ErrorPersonas, PersonasCliente, type PaginaDuplicados, type ParCandidato, type PersonaListada } from '@vitrina/plataforma/personas-ui';
import { SesionService } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { ESTADO_DESCARTE } from '../../models/descarte-hecho';
import { DuplicadosListaPage } from './duplicados-lista.page';

const LISTADA: PersonaListada = {
  id: 'per-a',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  denominacion: 'Quispe Mamani, Juana',
  celularPrincipal: '987654321',
  correoPrincipal: null,
  roles: [],
  coincidencia: null,
};
const JUANA: ParCandidato = {
  personaA: LISTADA,
  personaB: { ...LISTADA, id: 'per-b', tipoDocumento: 'PASAPORTE', numeroDocumento: '118204573', denominacion: 'Quispe, Juana' },
  puntaje: 60,
  motivos: ['CELULAR_Y_NOMBRE_PARECIDO'],
};
const ROSA: ParCandidato = {
  personaA: { ...LISTADA, id: 'per-c', numeroDocumento: '40236718', denominacion: 'Valdivieso Chávez, Rosa' },
  personaB: { ...LISTADA, id: 'per-d', tipoDocumento: 'CE', numeroDocumento: '40236718', denominacion: 'Valdivieso Chávez, Rosa' },
  puntaje: 100,
  motivos: ['MISMO_NUMERO_OTRO_TIPO'],
};
const pagina = (items: ParCandidato[], total = items.length): PaginaDuplicados => ({ items, total, pagina: 1, tamano: 20 });

@Component({ selector: 'vit-destino-duplicados', template: '' })
class Destino {}

describe('DuplicadosListaPage', () => {
  let harness: RouterTestingHarness;
  let sesion: DobleSesion;
  let duplicados: { listar: ReturnType<typeof vi.fn>; descartar: ReturnType<typeof vi.fn>; quitarDescarte: ReturnType<typeof vi.fn> };
  let obtener: ReturnType<typeof vi.fn>;
  let exigirMfa: ReturnType<typeof vi.fn>;
  let avisos: { confirmar: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const accion = (nombre: string) => elemento().querySelector(`[data-accion="${nombre}"]`) as HTMLElement | null;
  const franja = () => elemento().querySelector('[data-franja="deshacer"]');

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  /** Cada llamada a `listar` devuelve la siguiente página de la lista; la última se repite. */
  async function abrir(ruta: string, paginas: PaginaDuplicados[] = [pagina([JUANA, ROSA])]): Promise<void> {
    const respuestas = [...paginas];
    duplicados = {
      listar: vi.fn(async () => (respuestas.length > 1 ? respuestas.shift() : respuestas[0])),
      descartar: vi.fn(async () => undefined),
      quitarDescarte: vi.fn(async () => undefined),
    };
    obtener = vi.fn(async () => ({ nombres: 'Juana', apellidoPaterno: 'Quispe', apellidoMaterno: 'Mamani', razonSocial: null }));
    exigirMfa = vi.fn(async () => true);
    avisos = { confirmar: vi.fn(async () => true), error: vi.fn(async () => undefined) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            children: [
              { path: 'personas', component: Destino },
              { path: 'personas/duplicados', component: DuplicadosListaPage },
              { path: 'personas/duplicados/:a/:b', component: Destino },
              { path: 'personas/:personaId', component: Destino },
            ],
          },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: DuplicadosCliente, useValue: duplicados },
        { provide: PersonasCliente, useValue: { obtener } },
        { provide: AccionSensibleService, useValue: { exigirMfa } },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    harness = await RouterTestingHarness.create(ruta);
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion().conPermisos('plat.persona.leer', 'plat.persona.fusionar');
  });

  it('lista los pares con documentos, puntaje y motivos; enlaza a las fichas y a la comparación', async () => {
    await abrir('/admin/personas/duplicados');

    expect(duplicados.listar).toHaveBeenCalledWith({ personaId: null, pagina: 1, tamano: 20 });
    const texto = elemento().textContent ?? '';
    expect(texto).toContain('Quispe Mamani, Juana');
    expect(texto).toContain('Pasaporte 118204573');
    expect(texto).toContain('Mismo celular, nombre parecido');
    expect(texto).toContain('Mismo número, otro tipo de documento');
    expect(accion('ficha-b')?.getAttribute('href')).toBe('/admin/personas/per-b');
    expect(accion('comparar')?.getAttribute('href')).toBe('/admin/personas/duplicados/per-a/per-b');
    expect(accion('comparar')?.getAttribute('aria-label')).toBe('Comparar Quispe Mamani, Juana con Quispe, Juana');
    expect(accion('volver')?.getAttribute('href')).toBe('/admin/personas');
    expect(obtener).not.toHaveBeenCalled();
  });

  it('con persona en la URL filtra por ella y muestra el chip; quitarlo deja la lista completa', async () => {
    await abrir('/admin/personas/duplicados?persona=per-a&pagina=2', [pagina([JUANA])]);

    expect(duplicados.listar).toHaveBeenCalledWith({ personaId: 'per-a', pagina: 2, tamano: 20 });
    expect(obtener).toHaveBeenCalledWith('per-a');
    expect(elemento().querySelector('[data-filtro="persona"]')?.textContent).toContain('Pares de Quispe Mamani, Juana');

    accion('quitar-filtro')?.click();
    await estable();
    expect(url()).toBe('/admin/personas/duplicados');
    expect(duplicados.listar).toHaveBeenLastCalledWith({ personaId: null, pagina: 1, tamano: 20 });
    expect(elemento().querySelector('[data-filtro="persona"]')).toBeNull();
  });

  it('si la persona del filtro no se puede leer, el chip dice «Persona filtrada»', async () => {
    await abrir('/admin/personas/duplicados', [pagina([])]);
    obtener.mockRejectedValue(new ErrorPersonas('NO_ENCONTRADA', 'x', 404));
    await harness.navigateByUrl('/admin/personas/duplicados?persona=per-x');
    await estable();

    expect(elemento().querySelector('[data-filtro="persona"]')?.textContent).toContain('Persona filtrada');
  });

  it('descartar pide aal2 y confirmación, saca el par y deja «Deshacer», que lo devuelve', async () => {
    await abrir('/admin/personas/duplicados', [pagina([JUANA, ROSA]), pagina([ROSA]), pagina([JUANA, ROSA])]);

    accion('descartar')?.click();
    await estable();
    expect(exigirMfa).toHaveBeenCalled();
    expect(avisos.confirmar).toHaveBeenCalledWith({
      titulo: '¿No son la misma persona?',
      texto: 'Quispe Mamani, Juana — Quispe, Juana. El par no se volverá a proponer.',
      textoConfirmar: 'No son la misma',
    });
    expect(duplicados.descartar).toHaveBeenCalledWith('per-a', 'per-b');
    expect(elemento().querySelector('[href="/admin/personas/per-b"]')).toBeNull();
    expect(franja()?.textContent).toContain('Se descartó el par Quispe Mamani, Juana — Quispe, Juana');

    accion('deshacer')?.click();
    await estable();
    expect(duplicados.quitarDescarte).toHaveBeenCalledWith('per-a', 'per-b');
    expect(franja()).toBeNull();
    expect(elemento().textContent).toContain('Quispe, Juana');
  });

  it('sin MFA o sin confirmar no descarta', async () => {
    await abrir('/admin/personas/duplicados');
    exigirMfa.mockResolvedValueOnce(false);
    accion('descartar')?.click();
    await estable();
    avisos.confirmar.mockResolvedValueOnce(false);
    accion('descartar')?.click();
    await estable();

    expect(avisos.confirmar).toHaveBeenCalledTimes(1);
    expect(duplicados.descartar).not.toHaveBeenCalled();
    expect(franja()).toBeNull();
  });

  it('un error al descartar se avisa con su mensaje y no deja franja', async () => {
    await abrir('/admin/personas/duplicados');
    duplicados.descartar.mockRejectedValueOnce(new ErrorPersonas('PERSONA_FUSIONADA', 'x', 409));
    accion('descartar')?.click();
    await estable();

    expect(avisos.error).toHaveBeenCalledWith('No se pudo completar', 'Una de las fichas ya se fusionó con otra');
    expect(franja()).toBeNull();
  });

  it('la franja de deshacer se va al cambiar de página', async () => {
    await abrir('/admin/personas/duplicados', [pagina([JUANA, ROSA], 30), pagina([ROSA], 29)]);
    accion('descartar')?.click();
    await estable();
    expect(franja()).not.toBeNull();

    await harness.navigateByUrl('/admin/personas/duplicados?pagina=2');
    await estable();
    expect(franja()).toBeNull();
  });

  it('el descarte hecho en la comparación llega con la navegación y deja «Deshacer»', async () => {
    await abrir('/admin/personas', [pagina([ROSA])]);
    await TestBed.inject(Router).navigateByUrl('/admin/personas/duplicados', {
      state: { [ESTADO_DESCARTE]: { idA: 'per-a', idB: 'per-b', texto: 'Se descartó el par Quispe Mamani, Juana — Quispe, Juana' } },
    });
    await estable();

    expect(franja()?.textContent).toContain('Se descartó el par Quispe Mamani, Juana — Quispe, Juana');
    accion('deshacer')?.click();
    await estable();
    expect(duplicados.quitarDescarte).toHaveBeenCalledWith('per-a', 'per-b');
  });

  it('sin pares muestra el estado vacío', async () => {
    await abrir('/admin/personas/duplicados', [pagina([])]);
    expect(elemento().textContent).toContain('No hay posibles duplicados');
    expect(elemento().textContent).toContain('Se proponen pares con el mismo número en otro tipo de documento o el mismo celular');
  });

  it('sin plat.persona.fusionar no se ve «No son la misma persona», pero sí comparar', async () => {
    sesion = new DobleSesion().conPermisos('plat.persona.leer');
    await abrir('/admin/personas/duplicados');
    expect(accion('descartar')).toBeNull();
    expect(accion('comparar')).not.toBeNull();
  });
});
