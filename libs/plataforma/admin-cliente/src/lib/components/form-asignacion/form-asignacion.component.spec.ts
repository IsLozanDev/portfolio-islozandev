import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CONFIG_AUTH } from '@vitrina/shared/auth';
import { estable } from '../../../testing/estable';
import { API_URL } from '../../../testing/http-de-prueba';
import type { Asignables } from '../../models/asignable';
import { MENSAJES_ASIGNACION } from '../../models/mensajes-admin';
import { crearGrupoAsignacion } from '../../utils/formulario-asignacion';
import { FormAsignacionComponent } from './form-asignacion.component';

const ASIGNABLES: Asignables = {
  roles: [{ id: 'r-cajero', codigo: 'CAJERO', nombre: 'Cajero', productoCodigo: 'REST', sensible: false }],
  perfiles: [{ id: 'p-turno', codigo: 'TURNO', nombre: 'Turno', sensible: true }],
};

@Component({
  imports: [FormAsignacionComponent],
  template: '<vit-form-asignacion [grupo]="grupo" [asignables]="asignables" [conVigenteDesde]="conVigenteDesde()" />',
})
class Anfitrion {
  readonly grupo = crearGrupoAsignacion();
  readonly asignables = ASIGNABLES;
  readonly conVigenteDesde = signal(true);
}

describe('FormAsignacionComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let http: HttpTestingController;

  const elemento = () => fixture.nativeElement as HTMLElement;
  const grupo = () => fixture.componentInstance.grupo;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Anfitrion],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Anfitrion);
    await fixture.whenStable();
    http.expectOne((solicitud) => solicitud.url === `${API_URL}/org/empresas`).flush({ items: [], total: 0 });
    await estable(fixture);
  });

  afterEach(() => http.verify());

  it('ofrece roles y perfiles en un solo selector agrupado y marca los sensibles', async () => {
    elemento().querySelector<HTMLElement>('[data-campo=asignable]')?.click();
    await estable(fixture);

    const grupos = [...document.querySelectorAll('mat-optgroup')].map((opciones) => opciones.textContent?.replace(/\s+/g, ' ').trim());
    expect(grupos).toEqual([`${MENSAJES_ASIGNACION.roles} Cajero · REST`, `${MENSAJES_ASIGNACION.perfiles} Turno (${MENSAJES_ASIGNACION.sensible})`]);
  });

  it('TR-CA-038: hasta anterior a desde muestra el mensaje y deja el grupo inválido', async () => {
    grupo().patchValue({ asignable: 'rol:r-cajero', alcance: 'TENANT', vigenteDesde: new Date(2026, 9, 20), vigenteHasta: new Date(2026, 9, 19) });
    await estable(fixture);

    expect(elemento().querySelector('[data-error=vigencia]')?.textContent?.trim()).toBe(MENSAJES_ASIGNACION.vigenciaInvalida);
    expect(grupo().invalid).toBe(true);

    grupo().patchValue({ vigenteHasta: new Date(2026, 9, 31) });
    await estable(fixture);
    expect(elemento().querySelector('[data-error=vigencia]')).toBeNull();
    expect(grupo().valid).toBe(true);
  });

  it('sin vigente desde (invitar) solo muestra vigente hasta', async () => {
    expect(elemento().querySelector('[data-campo=vigente-desde]')).not.toBeNull();

    fixture.componentInstance.conVigenteDesde.set(false);
    await estable(fixture);

    expect(elemento().querySelector('[data-campo=vigente-desde]')).toBeNull();
    expect(elemento().querySelector('[data-campo=vigente-hasta]')).not.toBeNull();
  });
});
