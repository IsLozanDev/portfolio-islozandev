import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { InsigniasMenuService } from '@vitrina/shared/shell';
import { DobleSesion } from '../../testing/doble-sesion';
import { API_URL } from '../../testing/http-de-prueba';
import { PERMISOS_ADMIN } from '../models/permisos-admin';
import { InsigniasSoporteService, OPCION_MENU_SOPORTE } from './insignias-soporte.service';

const RUTA_PENDIENTES = `${API_URL}/seg/soporte/solicitudes/pendientes`;

describe('InsigniasSoporteService', () => {
  let http: HttpTestingController;
  let sesion: DobleSesion;

  function iniciar(): InsigniasSoporteService {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SesionService, useValue: sesion }, { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } }],
    });
    http = TestBed.inject(HttpTestingController);
    const servicio = TestBed.inject(InsigniasSoporteService);
    TestBed.tick();
    return servicio;
  }

  const enMenu = () => TestBed.inject(InsigniasMenuService).insignias()[OPCION_MENU_SOPORTE];

  afterEach(() => http.verify());

  it('con plat.soporte.autorizar pide las pendientes y las pone junto a «Soporte»', async () => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.soporteAutorizar);
    const servicio = iniciar();

    http.expectOne(RUTA_PENDIENTES).flush({ total: 3 });
    await new Promise((resolver) => setTimeout(resolver));

    expect(enMenu()).toBe(3);
    expect(servicio.pendientes()).toBe(3);
  });

  it('sin el permiso no pide nada y deja 0 (el agente en soporte nunca lo tiene)', () => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.seguridadBitacora);
    iniciar();

    http.expectNone(RUTA_PENDIENTES);
    expect(enMenu()).toBe(0);
  });

  it('si la API falla, no muestra número', async () => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.soporteAutorizar);
    iniciar();

    http.expectOne(RUTA_PENDIENTES).flush({ codigo: 'X' }, { status: 503, statusText: 'Service Unavailable' });
    await new Promise((resolver) => setTimeout(resolver));

    expect(enMenu()).toBe(0);
  });

  it('cambiar de contexto vuelve a contar', async () => {
    sesion = new DobleSesion().conPermisos(PERMISOS_ADMIN.soporteAutorizar);
    iniciar();
    http.expectOne(RUTA_PENDIENTES).flush({ total: 1 });

    sesion.conPermisos();
    TestBed.tick();

    http.expectNone(RUTA_PENDIENTES);
    expect(enMenu()).toBe(0);
  });
});
