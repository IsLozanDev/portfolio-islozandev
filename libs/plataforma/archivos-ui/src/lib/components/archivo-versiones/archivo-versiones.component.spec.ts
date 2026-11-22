import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService, PanelLateralService } from '@vitrina/shared/ui';
import { Subject } from 'rxjs';
import type { EstadoArchivo, VersionArchivo, VersionesArchivo } from '../../models/archivo';
import type { ArchivoDisponible } from '../../models/estado-carga';
import { MENSAJES_ARCHIVO_VERSIONES } from '../../models/mensajes-archivo-versiones';
import { ArchivosCliente } from '../../services/archivos.cliente';
import { PanelSubirVersionComponent } from '../panel-subir-version/panel-subir-version.component';
import { ArchivoVersionesComponent } from './archivo-versiones.component';

const ARCHIVO_ID = 'arc-1';
const version = (numero: number, estado: VersionArchivo['estado'], vigente = false): VersionArchivo => ({
  numero,
  estado,
  vigente,
  bytes: 1258291,
  subidoPor: 'usr-1',
  subidoEn: '2026-11-18T15:42:00.000Z',
});
const VERSIONES: VersionesArchivo = { archivoId: ARCHIVO_ID, versionVigente: 3, versiones: [version(1, 'DISPONIBLE'), version(2, 'CUARENTENA'), version(3, 'DISPONIBLE', true)] };
const ESTADO: EstadoArchivo = { archivoId: ARCHIVO_ID, estado: 'DISPONIBLE', categoria: 'DOCUMENTO', nombreOriginal: 'contrato.pdf', versionVigente: 3 };

async function estable(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('ArchivoVersionesComponent', () => {
  let fixture: ComponentFixture<ArchivoVersionesComponent>;
  let archivos: Record<string, ReturnType<typeof vi.fn>>;
  let avisos: { confirmar: ReturnType<typeof vi.fn>; toast: ReturnType<typeof vi.fn> };
  let abrirPanel: ReturnType<typeof vi.fn>;
  let cierrePanel: Subject<ArchivoDisponible | undefined>;
  let permisos: Set<string>;

  beforeEach(() => {
    permisos = new Set(['plat.archivo.versionar', 'plat.archivo.descargar']);
    cierrePanel = new Subject();
    archivos = {
      versiones: vi.fn(async () => VERSIONES),
      estado: vi.fn(async () => ESTADO),
      marcarVigente: vi.fn(async () => ({ ...ESTADO, versionVigente: 1 })),
      urlDescarga: vi.fn(async () => ({ url: 'https://storage.test/v1', expiraEn: '2026-11-22T12:00:00Z' })),
    };
    avisos = { confirmar: vi.fn(async () => true), toast: vi.fn() };
    abrirPanel = vi.fn(() => ({ afterClosed: () => cierrePanel.asObservable() }));
    TestBed.configureTestingModule({
      providers: [
        { provide: ArchivosCliente, useValue: archivos },
        { provide: AvisosService, useValue: avisos },
        { provide: PanelLateralService, useValue: { abrir: abrirPanel } },
        { provide: SesionService, useValue: { tiene: (permiso: string) => permisos.has(permiso) } },
      ],
    });
  });

  async function montar(): Promise<void> {
    fixture = TestBed.createComponent(ArchivoVersionesComponent);
    fixture.componentRef.setInput('archivoId', ARCHIVO_ID);
    fixture.detectChanges();
    await estable(fixture);
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const filas = () => [...raiz().querySelectorAll('tr[mat-row]')] as HTMLElement[];
  const botones = (accion: string) => [...raiz().querySelectorAll(`[data-accion="${accion}"]`)] as HTMLButtonElement[];

  it('lista las versiones de la más nueva a la más vieja con estado, vigente, tamaño y hora de Lima', async () => {
    await montar();

    expect(raiz().querySelector('[data-prueba="nombre"]')?.textContent).toBe('contrato.pdf');
    const [tercera, segunda] = filas().map((fila) => fila.textContent ?? '');
    expect(tercera).toContain('3');
    expect(tercera).toContain('Disponible');
    expect(tercera).toContain('check_circle');
    expect(tercera).toContain('1.2 MB');
    expect(tercera).toContain('18/11/2026 10:42');
    expect(segunda).toContain('En cuarentena');
  });

  it('Descargar solo en las DISPONIBLE y baja esa versión; Marcar vigente solo en las DISPONIBLE no vigentes', async () => {
    await montar();
    const abrir = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(botones('descargar').map((boton) => boton.getAttribute('aria-label'))).toEqual(['Descargar la versión 3', 'Descargar la versión 1']);
    expect(botones('marcar-vigente').map((boton) => boton.getAttribute('aria-label'))).toEqual(['Marcar vigente la versión 1']);
    botones('descargar')[1].click();
    await estable(fixture);
    expect(archivos['urlDescarga']).toHaveBeenCalledWith(ARCHIVO_ID, 1);
    expect(abrir).toHaveBeenCalled();
    abrir.mockRestore();
  });

  it('Marcar vigente pide confirmación, llama a la API, recarga y emite', async () => {
    await montar();
    const cambiadas: number[] = [];
    fixture.componentInstance.vigenteCambiada.subscribe((numero) => cambiadas.push(numero));

    botones('marcar-vigente')[0].click();
    await estable(fixture);
    expect(avisos.confirmar).toHaveBeenCalledWith({
      titulo: '¿Marcar vigente la versión 1?',
      texto: 'La descarga por defecto entregará la versión 1. La versión 3 sigue disponible.',
      textoConfirmar: 'Marcar vigente',
    });
    expect(archivos['marcarVigente']).toHaveBeenCalledWith(ARCHIVO_ID, 1);
    expect(archivos['versiones']).toHaveBeenCalledTimes(2);
    expect(cambiadas).toEqual([1]);
  });

  it('si no confirma, no marca', async () => {
    avisos.confirmar.mockResolvedValueOnce(false);
    await montar();
    botones('marcar-vigente')[0].click();
    await estable(fixture);
    expect(archivos['marcarVigente']).not.toHaveBeenCalled();
  });

  it('Subir versión abre el panel con el archivo y su categoría, y al cerrarse recarga la lista', async () => {
    await montar();
    botones('subir-version')[0].click();

    expect(abrirPanel).toHaveBeenCalledWith(PanelSubirVersionComponent, {
      datos: { archivoId: ARCHIVO_ID, categoria: 'DOCUMENTO', nombre: 'contrato.pdf', versionVigente: 3 },
    });
    cierrePanel.next({ archivoId: ARCHIVO_ID, numero: 4 });
    await estable(fixture);
    expect(archivos['versiones']).toHaveBeenCalledTimes(2);
  });

  it('con una versión en curso, «Subir versión» queda deshabilitado con su aviso', async () => {
    archivos['estado'].mockResolvedValue({ ...ESTADO, versionEnCurso: { numero: 4, estado: 'EN_ANALISIS' } });
    archivos['versiones'].mockResolvedValue({ ...VERSIONES, versiones: [...VERSIONES.versiones, version(4, 'EN_ANALISIS')] });
    await montar();

    expect(botones('subir-version')[0].disabled).toBe(true);
    expect(raiz().querySelector('[data-prueba="en-curso"]')?.textContent).toContain(MENSAJES_ARCHIVO_VERSIONES.enCurso);
    expect(filas()[0].textContent).toContain('En análisis');
  });

  it('sin plat.archivo.versionar no hay «Subir versión» ni «Marcar vigente»; sin descargar, no hay «Descargar»', async () => {
    permisos.clear();
    await montar();

    expect(botones('subir-version')).toHaveLength(0);
    expect(botones('marcar-vigente')).toHaveLength(0);
    expect(botones('descargar')).toHaveLength(0);
  });

  it('sin versiones muestra el estado vacío; si la API falla, el error', async () => {
    archivos['versiones'].mockResolvedValueOnce({ archivoId: ARCHIVO_ID, versiones: [] });
    await montar();
    expect(raiz().textContent).toContain(MENSAJES_ARCHIVO_VERSIONES.sinVersiones);

    archivos['versiones'].mockRejectedValueOnce(new Error('sin red'));
    await montar();
    expect(raiz().querySelector('[data-prueba="error"]')?.textContent).toContain(MENSAJES_ARCHIVO_VERSIONES.errorCarga);
  });
});
