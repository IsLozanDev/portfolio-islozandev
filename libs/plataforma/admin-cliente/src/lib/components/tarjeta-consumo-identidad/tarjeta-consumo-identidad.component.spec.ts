import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { estable } from '../../../testing/estable';
import { API_URL, prepararHttpDePrueba } from '../../../testing/http-de-prueba';
import { TarjetaConsumoIdentidadComponent } from './tarjeta-consumo-identidad.component';

const URL_CUOTA_ACTUAL = `${API_URL}/identidad/cuota-actual`;

const cuota = (consumidas: number, porcentaje: number) => ({ periodo: '2026-11', plan: 'BASICO', incluidas: 500, consumidas, porcentaje, umbral_aviso: 80 });

describe('TarjetaConsumoIdentidadComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TarjetaConsumoIdentidadComponent>;

  const elemento = (selector: string) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

  async function pintar(responder: (pedido: ReturnType<HttpTestingController['expectOne']>) => void): Promise<void> {
    http = prepararHttpDePrueba();
    fixture = TestBed.createComponent(TarjetaConsumoIdentidadComponent);
    fixture.detectChanges();
    responder(http.expectOne({ method: 'GET', url: URL_CUOTA_ACTUAL }));
    await estable(fixture);
  }

  afterEach(() => http.verify());

  it('mientras carga muestra el indicador', () => {
    http = prepararHttpDePrueba();
    fixture = TestBed.createComponent(TarjetaConsumoIdentidadComponent);
    fixture.detectChanges();

    expect(elemento('vit-cargando')).not.toBeNull();
    http.expectOne(URL_CUOTA_ACTUAL).flush(cuota(0, 0));
  });

  it('muestra mes, plan, barra, «120 de 500 consultas» y el estado normal', async () => {
    await pintar((pedido) => pedido.flush(cuota(120, 24)));

    expect(elemento('[data-mes]')?.textContent?.trim()).toBe('noviembre 2026 · Plan BASICO');
    expect(elemento('[data-consultas]')?.textContent?.trim()).toBe('120 de 500 consultas');
    expect(elemento('vit-chip-estado')?.textContent?.trim()).toBe('Normal');
    const barra = elemento('mat-progress-bar');
    expect(barra?.getAttribute('aria-valuenow')).toBe('24');
    expect(barra?.classList).toContain('vit-barra-exito');
  });

  it('410 de 500 con umbral 80 muestra «Sobre el umbral»', async () => {
    await pintar((pedido) => pedido.flush(cuota(410, 82)));

    expect(elemento('vit-chip-estado')?.textContent?.trim()).toBe('Sobre el umbral');
    expect(elemento('mat-progress-bar')?.classList).toContain('vit-barra-advertencia');
  });

  it('500 de 500 muestra «Agotada»', async () => {
    await pintar((pedido) => pedido.flush(cuota(500, 100)));

    expect(elemento('vit-chip-estado')?.textContent?.trim()).toBe('Agotada');
    expect(elemento('mat-progress-bar')?.classList).toContain('vit-barra-error');
  });

  it('si la API falla dice «No se pudo cargar el consumo»', async () => {
    await pintar((pedido) => pedido.flush({ codigo: 'X', mensaje: 'x' }, { status: 503, statusText: 'Service Unavailable' }));

    expect(elemento('[data-error]')?.textContent?.trim()).toBe('No se pudo cargar el consumo');
    expect(elemento('mat-progress-bar')).toBeNull();
  });
});
