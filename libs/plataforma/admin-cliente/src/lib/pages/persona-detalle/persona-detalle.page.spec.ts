import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  ConsentimientosCliente,
  DuplicadosCliente,
  ErrorPersonas,
  PersonaContactosComponent,
  PersonaRolesComponent,
  PersonasCliente,
  type PaginaDuplicados,
  type PersonaDetalle,
} from '@vitrina/plataforma/personas-ui';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { PersonaDetallePage } from './persona-detalle.page';

const JUANA: PersonaDetalle = {
  id: 'per-juana',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: 'Mamani',
  razonSocial: null,
  activo: true,
  version: 5,
  roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null }],
  contactos: [{ id: 'c1', tipo: 'CELULAR', valor: '987654321', principal: true }],
  direcciones: [],
  resueltaDesde: null,
  alias: [],
};

const SIN_DUPLICADOS: PaginaDuplicados = { items: [], total: 0, pagina: 1, tamano: 1 };
const PASAPORTE = {
  id: 'per-pasaporte',
  tipoPersona: 'NATURAL' as const,
  tipoDocumento: 'PASAPORTE' as const,
  numeroDocumento: '118204573',
  denominacion: 'Quispe, Juana',
  celularPrincipal: '987654321',
  correoPrincipal: null,
  roles: [],
  coincidencia: null,
};

describe('PersonaDetallePage', () => {
  let harness: RouterTestingHarness;
  let obtener: ReturnType<typeof vi.fn>;
  let listarDuplicados: ReturnType<typeof vi.fn>;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(
    respuesta: (personaId: string) => Promise<PersonaDetalle>,
    duplicados: () => Promise<PaginaDuplicados> = async () => SIN_DUPLICADOS,
  ): Promise<void> {
    obtener = vi.fn(respuesta);
    listarDuplicados = vi.fn(duplicados);
    avisos = { toast: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([
          { path: 'admin/personas/duplicados', component: PersonaDetallePage },
          { path: 'admin/personas/:personaId', component: PersonaDetallePage },
        ]),
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
        { provide: SesionService, useValue: new DobleSesion().conPermisos('plat.persona.leer') },
        { provide: PersonasCliente, useValue: { obtener } },
        { provide: DuplicadosCliente, useValue: { listar: listarDuplicados } },
        { provide: ConsentimientosCliente, useValue: { vigentes: vi.fn(async () => []) } },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    harness = await RouterTestingHarness.create('/admin/personas/per-juana');
    await estable();
  }

  it('muestra la cabecera con denominación, documento y roles, y las cinco secciones', async () => {
    await abrir(async () => JUANA);

    expect(obtener).toHaveBeenCalledWith('per-juana');
    expect(elemento().querySelector('[data-prueba="denominacion"]')?.textContent?.trim()).toBe('Quispe Mamani, Juana');
    expect(elemento().textContent).toContain('DNI 45781236');
    expect(elemento().querySelector('[data-prueba="roles-cabecera"]')?.textContent).toContain('CLI · Paciente');
    for (const selector of ['vit-persona-datos-basicos', 'vit-persona-contactos', 'vit-persona-direcciones', 'vit-persona-roles', 'vit-persona-consentimientos']) {
      expect(elemento().querySelector(selector)).not.toBeNull();
    }
  });

  it('una persona de otro tenant o inexistente muestra que no existe', async () => {
    await abrir(async () => {
      throw new ErrorPersonas('NO_ENCONTRADA', 'No existe esa persona', 404);
    });
    expect(elemento().querySelector('[data-prueba="no-existe"]')?.textContent).toContain('La persona no existe o no es de su organización');
  });

  it('un cambio con la persona nueva la reemplaza sin releer', async () => {
    await abrir(async () => JUANA);
    const contactos = harness.fixture.debugElement.query(By.directive(PersonaContactosComponent)).componentInstance as PersonaContactosComponent;
    contactos.cambio.emit({ tipo: 'actualizada', persona: { ...JUANA, nombres: 'Juana María', version: 6 } });
    await estable();

    expect(obtener).toHaveBeenCalledTimes(1);
    expect(elemento().querySelector('[data-prueba="denominacion"]')?.textContent?.trim()).toBe('Quispe Mamani, Juana María');
  });

  it('un cambio que pide recargar relee la persona y muestra su aviso', async () => {
    await abrir(async () => JUANA);
    const roles = harness.fixture.debugElement.query(By.directive(PersonaRolesComponent)).componentInstance as PersonaRolesComponent;
    roles.cambio.emit({ tipo: 'recargar', aviso: 'La persona cambió; se recargaron sus datos' });
    await estable();

    expect(obtener).toHaveBeenCalledTimes(2);
    expect(avisos.toast).toHaveBeenCalledWith('info', 'La persona cambió; se recargaron sus datos');
  });

  it('con posibles duplicados muestra la sección con el total y «Revisar» a la lista filtrada', async () => {
    await abrir(async () => JUANA, async () => ({
      items: [{ personaA: PASAPORTE, personaB: { ...PASAPORTE, id: 'per-juana' }, puntaje: 60, motivos: ['CELULAR_Y_NOMBRE_PARECIDO'] }],
      total: 1,
      pagina: 1,
      tamano: 1,
    }));
    harness.detectChanges();

    expect(listarDuplicados).toHaveBeenCalledWith({ pagina: 1, tamano: 1, personaId: 'per-juana' });
    const seccion = elemento().querySelector('[data-seccion="duplicados"]');
    expect(seccion?.textContent).toContain('Posibles duplicados (1)');
    expect(seccion?.textContent).toContain('Quispe, Juana');
    expect(seccion?.textContent).toContain('Pasaporte 118204573');
    expect(seccion?.textContent).toContain('Puntaje 60');
    expect(seccion?.querySelector('[data-accion="revisar-duplicados"]')?.getAttribute('href')).toBe('/admin/personas/duplicados?persona=per-juana');
  });

  it('sin pares o si la consulta de duplicados falla, la sección no aparece y la ficha sigue', async () => {
    await abrir(async () => JUANA);
    expect(elemento().querySelector('[data-seccion="duplicados"]')).toBeNull();

    TestBed.resetTestingModule();
    await abrir(async () => JUANA, async () => {
      throw new ErrorPersonas('DESCONOCIDO', 'x', 500);
    });
    expect(elemento().querySelector('[data-seccion="duplicados"]')).toBeNull();
    expect(elemento().querySelector('[data-prueba="denominacion"]')?.textContent?.trim()).toBe('Quispe Mamani, Juana');
  });

  it('la ficha de una absorbida cambia la URL a la conservada y avisa, sin releer', async () => {
    await abrir(async () => ({ ...JUANA, resueltaDesde: 'per-juana', id: 'per-conservada', alias: ['per-juana'] }));
    await estable();

    expect(TestBed.inject(Router).url).toBe('/admin/personas/per-conservada');
    expect(avisos.toast).toHaveBeenCalledWith('info', 'Esta ficha se fusionó en Quispe Mamani, Juana. Se muestra la ficha vigente.');
    expect(obtener).toHaveBeenCalledTimes(1);
    expect(elemento().querySelector('[data-prueba="denominacion"]')?.textContent?.trim()).toBe('Quispe Mamani, Juana');
  });

  it('un 409 PERSONA_FUSIONADA al editar relee, pasa a la conservada y muestra solo el aviso del alias', async () => {
    await abrir(async (personaId) =>
      obtener.mock.calls.length === 1 ? JUANA : { ...JUANA, id: 'per-conservada', resueltaDesde: personaId, alias: [personaId] },
    );
    const roles = harness.fixture.debugElement.query(By.directive(PersonaRolesComponent)).componentInstance as PersonaRolesComponent;
    roles.cambio.emit({ tipo: 'recargar', aviso: 'La persona cambió; se recargaron sus datos' });
    await estable();

    expect(TestBed.inject(Router).url).toBe('/admin/personas/per-conservada');
    expect(avisos.toast).toHaveBeenCalledTimes(1);
    expect(avisos.toast).toHaveBeenCalledWith('info', 'Esta ficha se fusionó en Quispe Mamani, Juana. Se muestra la ficha vigente.');
  });
});
