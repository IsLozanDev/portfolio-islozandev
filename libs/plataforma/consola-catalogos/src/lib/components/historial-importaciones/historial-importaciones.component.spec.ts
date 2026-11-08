import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../../testing/http-de-prueba';
import { estable } from '../../../testing/estable';
import { ImportacionesCliente } from '../../services/importaciones.cliente';
import { HistorialImportacionesComponent } from './historial-importaciones.component';

const importacion = (id: string, estado: string, totalErrores = 0, motivo: string | null = null) => ({
  id,
  estado,
  version_oficial: '2026-06',
  fecha_vigencia: '2026-06-01',
  archivo_nombre: 'ubigeo.csv',
  archivo_sha256: 'a',
  resumen: { altas: 18, cambios: 0, bajas: 0, sin_cambios: 1874 },
  total_errores: totalErrores,
  motivo_fallo: motivo,
  lanzado_por: 'u-1',
  creado_en: '2026-11-08T15:42:00.000Z',
  aplicado_por: null,
  terminado_en: null,
});

describe('HistorialImportacionesComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HistorialImportacionesComponent>;

  async function abrir(items: object[]): Promise<void> {
    http = prepararHttpDePrueba();
    fixture = TestBed.createComponent(HistorialImportacionesComponent);
    fixture.componentRef.setInput('codigoCatalogo', 'UBIGEO');
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: `${API_URL}/catalogos/UBIGEO/importaciones?pagina=1&tamano=20` }).flush({ items, total: items.length });
    await estable(fixture);
  }

  afterEach(() => http.verify());

  it('muestra fecha y hora de Lima, estado, conteos y motivo', async () => {
    await abrir([importacion('a', 'APLICADA'), importacion('b', 'FALLIDA', 0, 'Se cayó la base')]);
    const [aplicada, fallida] = [...fixture.nativeElement.querySelectorAll('tr[mat-row]')].map((fila: HTMLElement) => fila.textContent ?? '');

    expect(aplicada).toContain('08/11/2026 10:42');
    expect(aplicada).toContain('Aplicada');
    expect(aplicada).toContain('01/06/2026');
    expect(fallida).toContain('Se cayó la base');
  });

  it('«Descargar errores» solo aparece en las RECHAZADA y descarga ese CSV', async () => {
    await abrir([importacion('a', 'APLICADA'), importacion('r', 'RECHAZADA', 3000), importacion('v', 'VENCIDA')]);
    const descargar = vi.spyOn(TestBed.inject(ImportacionesCliente), 'descargarErrores').mockResolvedValue(undefined);
    const botones = fixture.nativeElement.querySelectorAll('[data-accion="descargar-errores"]') as NodeListOf<HTMLButtonElement>;

    expect(botones).toHaveLength(1);
    botones[0].click();
    await estable(fixture);
    expect(descargar).toHaveBeenCalledWith('r');
  });

  it('recargar vuelve a pedir la página actual', async () => {
    await abrir([importacion('a', 'EN_COLA')]);
    void fixture.componentInstance.recargar();
    http.expectOne(`${API_URL}/catalogos/UBIGEO/importaciones?pagina=1&tamano=20`).flush({ items: [importacion('a', 'APLICADA')], total: 1 });
    await estable(fixture);

    expect(fixture.nativeElement.querySelector('tr[mat-row]')?.textContent).toContain('Aplicada');
  });
});
