import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  ConsentimientosCliente,
  ErrorPersonas,
  PersonaContactosComponent,
  PersonaRolesComponent,
  PersonasCliente,
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
};

describe('PersonaDetallePage', () => {
  let harness: RouterTestingHarness;
  let obtener: ReturnType<typeof vi.fn>;
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(respuesta: () => Promise<PersonaDetalle>): Promise<void> {
    obtener = vi.fn(respuesta);
    avisos = { toast: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([{ path: 'admin/personas/:personaId', component: PersonaDetallePage }]),
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
        { provide: SesionService, useValue: new DobleSesion().conPermisos('plat.persona.leer') },
        { provide: PersonasCliente, useValue: { obtener } },
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
});
