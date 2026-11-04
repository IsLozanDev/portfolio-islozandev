import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { ErrorSoporte } from '../../models/error-soporte';
import { MENSAJES_SOPORTE } from '../../models/mensajes-soporte';
import { SoporteAgenteCliente } from '../../services/soporte-agente.cliente';
import { TenantsSoporteCliente } from '../../services/tenants-soporte.cliente';
import type { GrupoSolicitud } from '../../utils/formulario-solicitud';
import { ESPERA_BUSQUEDA_TENANT_MS, SolicitarSoportePage } from './solicitar-soporte.page';

const TENANT = { id: 't-polleria', codigo: 'polleria-dona-rosa', nombre: 'Pollería Doña Rosa' };

@Component({ template: '' })
class Destino {}

/** La primera prueba compila el autocompletar y los select de Material; con la máquina ocupada pasa los 5 s. */
const ESPERA_PRIMERA_CARGA_MS = 30_000;

describe('SolicitarSoportePage', { timeout: ESPERA_PRIMERA_CARGA_MS }, () => {
  let harness: RouterTestingHarness;
  let soporte: { solicitar: ReturnType<typeof vi.fn> };
  let tenants: { buscar: ReturnType<typeof vi.fn> };
  let avisos: { toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const pagina = () => harness.routeDebugElement?.componentInstance as SolicitarSoportePage;
  const grupo = () => (pagina() as unknown as { grupo: GrupoSolicitud }).grupo;
  const url = () => TestBed.inject(Router).url;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  function escribir(campo: string, valor: string): void {
    const entrada = elemento().querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-campo=${campo}]`);
    if (!entrada) throw new Error(`No hay campo ${campo}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
  }

  async function enviar(): Promise<void> {
    elemento().querySelector('form')?.dispatchEvent(new Event('submit'));
    await estable();
  }

  async function llenarValido(): Promise<void> {
    grupo().controls.tenant.setValue(TENANT);
    escribir('ticket', 'SOP-000123');
    escribir('motivo', 'Revisar el cierre de caja del martes');
    await estable();
  }

  beforeEach(async () => {
    soporte = { solicitar: vi.fn(async () => 'a-9') };
    tenants = { buscar: vi.fn(async () => [TENANT]) };
    avisos = { toast: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'consola/soporte/solicitar', component: SolicitarSoportePage },
          { path: '**', component: Destino },
        ]),
        { provide: SoporteAgenteCliente, useValue: soporte },
        { provide: TenantsSoporteCliente, useValue: tenants },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    harness = await RouterTestingHarness.create('/consola/soporte/solicitar');
    await estable();
  });

  afterEach(() => vi.useRealTimers());

  it('busca tenants tras la espera, solo con dos letras o más', async () => {
    vi.useFakeTimers();
    escribir('tenant', 'p');
    escribir('tenant', 'pol');
    escribir('tenant', 'poll');
    vi.advanceTimersByTime(ESPERA_BUSQUEDA_TENANT_MS);
    vi.useRealTimers();
    await estable();

    expect(tenants.buscar).toHaveBeenCalledTimes(1);
    expect(tenants.buscar).toHaveBeenCalledWith('poll');
  });

  it('sin tenant elegido no envía y marca los errores', async () => {
    escribir('tenant', 'pollería');
    escribir('ticket', 'SOP-000123');
    escribir('motivo', 'Revisar el cierre de caja');
    await enviar();

    expect(soporte.solicitar).not.toHaveBeenCalled();
    expect(elemento().textContent).toContain(MENSAJES_SOPORTE.tenantRequerido);
  });

  it('envía la solicitud, avisa y vuelve a mis accesos', async () => {
    await llenarValido();
    await enviar();

    expect(soporte.solicitar).toHaveBeenCalledWith({
      tenantId: 't-polleria',
      ticket: 'SOP-000123',
      motivo: 'Revisar el cierre de caja del martes',
      modo: 'LECTURA',
      horas: 2,
    });
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_SOPORTE.solicitudEnviada);
    expect(url()).toBe('/consola/soporte');
  });

  it('muestra el error de la API y se queda en el formulario', async () => {
    soporte.solicitar.mockRejectedValueOnce(new ErrorSoporte('SOPORTE_AGENTE_ES_MIEMBRO', 'Ya es miembro de este tenant', 409));
    await llenarValido();
    await enviar();

    expect(elemento().querySelector('[role=alert]')?.textContent).toContain('Ya es miembro de este tenant');
    expect(url()).toBe('/consola/soporte/solicitar');
    expect(avisos.toast).not.toHaveBeenCalled();
  });
});
