import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { SesionService, StreamRechazado, CorteDeStream } from '@vitrina/shared/auth';
import { Subject } from 'rxjs';
import type { AvisoAnalisis } from '../../models/archivo';
import type { Categoria } from '../../models/categoria';
import { ErrorArchivos } from '../../models/error-archivos';
import type { ArchivoDisponible, ArchivoRechazado } from '../../models/estado-carga';
import { MENSAJES_ARCHIVO_CARGA } from '../../models/mensajes-archivo-carga';
import { ArchivosCliente } from '../../services/archivos.cliente';
import { CategoriasService } from '../../services/categorias.service';
import { EventosAnalisisCliente } from '../../services/eventos-analisis.cliente';
import { SubidaStorageCliente, type AvanceSubida } from '../../services/subida-storage.cliente';
import { ArchivoCargaComponent } from './archivo-carga.component';

const ARCHIVO_ID = 'arc-1';
const MIME_PDF = 'application/pdf';
const DOCUMENTO: Categoria = { codigo: 'DOCUMENTO', mimesPermitidos: [MIME_PDF, 'image/jpeg'], tamanoMaxBytes: 26214400 };
const CARGA = { url: 'https://storage.test/subir', token: 'firma', expiraEn: '2026-11-22T12:00:00Z' };
const MEGABYTE = 1024 * 1024;

const pdf = (bytes = 1258291, nombre = 'contrato.pdf') => new File([new Uint8Array(bytes)], nombre, { type: MIME_PDF });

/** Espera las promesas del componente (los clientes son async) y pinta. */
async function estable(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('ArchivoCargaComponent', () => {
  let fixture: ComponentFixture<ArchivoCargaComponent>;
  let archivos: Record<string, ReturnType<typeof vi.fn>>;
  let subida: Subject<AvanceSubida>;
  let analisis: Subject<AvisoAnalisis>;
  let subir: ReturnType<typeof vi.fn>;
  let abrirEventos: ReturnType<typeof vi.fn>;
  let permisos: Set<string>;
  let disponibles: ArchivoDisponible[];
  let rechazados: ArchivoRechazado[];

  beforeEach(() => {
    subida = new Subject();
    analisis = new Subject();
    permisos = new Set(['plat.archivo.descargar']);
    archivos = {
      solicitarCarga: vi.fn(async () => ({ archivoId: ARCHIVO_ID, carga: CARGA })),
      confirmarCarga: vi.fn(async () => ({ archivoId: ARCHIVO_ID, estado: 'EN_ANALISIS' })),
      solicitarVersion: vi.fn(async () => ({ archivoId: ARCHIVO_ID, numero: 3, carga: CARGA })),
      confirmarVersion: vi.fn(async () => ({ numero: 3, estado: 'EN_ANALISIS' })),
      estado: vi.fn(async () => ({ archivoId: ARCHIVO_ID, estado: 'DISPONIBLE', categoria: 'DOCUMENTO', nombreOriginal: 'contrato.pdf', bytes: 10 })),
      urlDescarga: vi.fn(async () => ({ url: 'https://storage.test/bajar', expiraEn: '2026-11-22T12:00:00Z' })),
    };
    subir = vi.fn(() => subida.asObservable());
    abrirEventos = vi.fn(() => analisis.asObservable());
    TestBed.configureTestingModule({
      providers: [
        { provide: ArchivosCliente, useValue: archivos },
        { provide: CategoriasService, useValue: { buscar: vi.fn(async (codigo: string) => (codigo === 'DOCUMENTO' ? DOCUMENTO : undefined)) } },
        { provide: SubidaStorageCliente, useValue: { subir } },
        { provide: EventosAnalisisCliente, useValue: { abrir: abrirEventos } },
        { provide: SesionService, useValue: { tiene: (permiso: string) => permisos.has(permiso) } },
      ],
    });
  });

  async function montar(entradas: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(ArchivoCargaComponent);
    disponibles = [];
    rechazados = [];
    fixture.componentInstance.disponible.subscribe((evento) => disponibles.push(evento));
    fixture.componentInstance.rechazado.subscribe((evento) => rechazados.push(evento));
    for (const [nombre, valor] of Object.entries({ categoria: 'DOCUMENTO', entidadTipo: 'PRUEBA_DEV', entidadId: 'e-1', ...entradas })) {
      fixture.componentRef.setInput(nombre, valor);
    }
    fixture.detectChanges();
    await estable(fixture);
  }

  const elemento = <T extends Element = HTMLElement>(selector: string) => fixture.nativeElement.querySelector(selector) as T | null;
  const zona = () => elemento('section') as HTMLElement;
  const requerido = <T extends Element = HTMLElement>(selector: string): T => {
    const encontrado = elemento<T>(selector);
    if (!encontrado) throw new Error(`No está ${selector}`);
    return encontrado;
  };
  const pulsar = (selector: string) => requerido<HTMLButtonElement>(selector).click();
  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  async function soltar(archivo: File): Promise<void> {
    const evento = new Event('drop', { cancelable: true }) as DragEvent;
    Object.defineProperty(evento, 'dataTransfer', { value: { files: [archivo] } });
    zona().dispatchEvent(evento);
    await estable(fixture);
  }

  async function subirHastaAnalisis(archivo = pdf()): Promise<void> {
    await soltar(archivo);
    subida.next({ tipo: 'progreso', porcentaje: 100 });
    subida.next({ tipo: 'terminado' });
    await estable(fixture);
  }

  it('en espera muestra la regla de la categoría, el accept y Enter sobre la zona abre el selector', async () => {
    await montar();
    const selector = requerido<HTMLInputElement>('[data-prueba="selector"]');
    const clic = vi.spyOn(selector, 'click').mockImplementation(() => undefined);

    expect(elemento('[data-prueba="regla"]')?.textContent).toBe('PDF o JPG · hasta 25 MB');
    expect(selector.accept).toBe(`${MIME_PDF},image/jpeg`);
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.zonaCarga);
    zona().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(clic).toHaveBeenCalledTimes(1);
  });

  it('un archivo fuera de la categoría se rechaza antes de subir, sin llamar a la API', async () => {
    await montar();
    await soltar(new File([new Uint8Array(10)], 'instalador.exe', { type: 'application/x-msdownload' }));

    expect(elemento('[data-prueba="aviso"]')?.textContent).toContain('Tipo de archivo no permitido: «instalador.exe». Solo PDF o JPG.');
    expect(archivos['solicitarCarga']).not.toHaveBeenCalled();
    expect(elemento('[data-accion="elegir"]')).not.toBeNull();
  });

  it('flujo completo: pide la carga, sube con progreso, confirma, abre el SSE y emite disponible', async () => {
    await montar();
    await soltar(pdf());

    expect(archivos['solicitarCarga']).toHaveBeenCalledWith({
      tamano: 1258291,
      mime: MIME_PDF,
      categoria: 'DOCUMENTO',
      nombreOriginal: 'contrato.pdf',
      entidadTipo: 'PRUEBA_DEV',
      entidadId: 'e-1',
    });
    expect(subir).toHaveBeenCalledWith(CARGA, expect.any(File), MIME_PDF);
    subida.next({ tipo: 'progreso', porcentaje: 64 });
    await estable(fixture);
    expect(elemento('mat-progress-bar')?.getAttribute('aria-valuenow')).toBe('64');
    expect(elemento('[data-prueba="detalle"]')?.textContent).toBe('1.2 MB · Subiendo 64 %');

    subida.next({ tipo: 'terminado' });
    await estable(fixture);
    expect(archivos['confirmarCarga']).toHaveBeenCalledWith(ARCHIVO_ID);
    expect(abrirEventos).toHaveBeenCalledWith(ARCHIVO_ID, 1);
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.enAnalisis);

    analisis.next({ tipo: 'estado', numero: 1 });
    analisis.next({ tipo: 'fin', numero: 1, resultado: 'DISPONIBLE' });
    await estable(fixture);
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.disponible);
    expect(elemento('[data-prueba="detalle"]')?.textContent).toBe('1.2 MB · Subido hace un momento');
    expect(disponibles).toEqual([{ archivoId: ARCHIVO_ID, numero: 1 }]);
  });

  it('Descargar pide la URL firmada de esa versión y la abre; sin permiso no aparece', async () => {
    await montar();
    await subirHastaAnalisis();
    analisis.next({ tipo: 'fin', numero: 1, resultado: 'DISPONIBLE' });
    await estable(fixture);
    const abrir = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    pulsar('[data-accion="descargar"]');
    await estable(fixture);
    expect(archivos['urlDescarga']).toHaveBeenCalledWith(ARCHIVO_ID, 1);
    expect(abrir).toHaveBeenCalled();
    abrir.mockRestore();

    permisos.clear();
    await montar({ archivoId: ARCHIVO_ID });
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.disponible);
    expect(elemento('[data-accion="descargar"]')).toBeNull();
  });

  it('Cancelar durante la subida aborta el PUT y vuelve a ESPERA', async () => {
    await montar();
    await soltar(pdf());
    expect(subida.observed).toBe(true);

    pulsar('[data-accion="cancelar"]');
    await estable(fixture);
    expect(subida.observed).toBe(false);
    expect(elemento('[data-accion="elegir"]')).not.toBeNull();
    expect(archivos['confirmarCarga']).not.toHaveBeenCalled();
  });

  it('destruir el componente aborta el PUT y cierra el SSE', async () => {
    await montar();
    await soltar(pdf());
    fixture.destroy();
    expect(subida.observed).toBe(false);

    await montar();
    await subirHastaAnalisis();
    expect(analisis.observed).toBe(true);
    fixture.destroy();
    expect(analisis.observed).toBe(false);
  });

  it('CUARENTENA: chip de error, mensaje del antivirus, sin Descargar y emite rechazado', async () => {
    await montar();
    await subirHastaAnalisis();
    analisis.next({ tipo: 'fin', numero: 1, resultado: 'CUARENTENA' });
    await estable(fixture);

    expect(texto()).toContain('En cuarentena');
    expect(elemento('[data-prueba="falla"]')?.textContent).toContain(MENSAJES_ARCHIVO_CARGA.cuarentena);
    expect(elemento('[data-accion="descargar"]')).toBeNull();
    expect(elemento('[data-accion="falla"]')?.textContent).toContain('Elegir otro archivo');
    expect(rechazados).toEqual([{ archivoId: ARCHIVO_ID, numero: 1, resultado: 'CUARENTENA', mensaje: MENSAJES_ARCHIVO_CARGA.cuarentena }]);
  });

  it('modo versión: pide y confirma la versión, sigue su SSE y muestra el mensaje de IDENTICA', async () => {
    await montar({ modo: 'version', archivoId: ARCHIVO_ID, categoria: '' });
    expect(archivos['estado']).toHaveBeenCalledWith(ARCHIVO_ID);
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.zonaVersion);

    await subirHastaAnalisis();
    expect(archivos['solicitarVersion']).toHaveBeenCalledWith(ARCHIVO_ID, { tamano: 1258291, mime: MIME_PDF });
    expect(archivos['confirmarVersion']).toHaveBeenCalledWith(ARCHIVO_ID, 3);
    expect(abrirEventos).toHaveBeenCalledWith(ARCHIVO_ID, 3);

    const mensaje = 'El archivo es idéntico a la versión vigente';
    analisis.next({ tipo: 'fin', numero: 3, resultado: 'RECHAZADO', motivo: 'IDENTICA', versionCoincidente: 2, mensaje });
    await estable(fixture);
    expect(elemento('[data-prueba="falla"]')?.textContent).toContain(mensaje);
    expect(rechazados).toEqual([{ archivoId: ARCHIVO_ID, numero: 3, resultado: 'RECHAZADO', mensaje }]);
  });

  it('modo versión disponible muestra «Versión n, vigente»', async () => {
    await montar({ modo: 'version', archivoId: ARCHIVO_ID });
    await subirHastaAnalisis();
    analisis.next({ tipo: 'fin', numero: 3, resultado: 'DISPONIBLE' });
    await estable(fixture);

    expect(elemento('[data-prueba="detalle"]')?.textContent).toBe('1.2 MB · Versión 3, vigente');
    expect(disponibles).toEqual([{ archivoId: ARCHIVO_ID, numero: 3 }]);
  });

  it('un error de Storage deja ERROR y Reintentar pide una carga nueva con el mismo archivo', async () => {
    await montar();
    await soltar(pdf());
    subida.error(new ErrorArchivos('DESCONOCIDO', 'x', 0));
    await estable(fixture);

    expect(texto()).toContain('No se subió');
    expect(elemento('[data-prueba="falla"]')?.textContent).toContain(MENSAJES_ARCHIVO_CARGA.errorSubida);
    subida = new Subject();
    pulsar('[data-accion="falla"]');
    await estable(fixture);
    expect(archivos['solicitarCarga']).toHaveBeenCalledTimes(2);
    expect(subida.observed).toBe(true);
  });

  it('un error de la API al pedir la carga muestra su mensaje', async () => {
    archivos['solicitarCarga'].mockRejectedValueOnce(new ErrorArchivos('TAMANO_EXCEDIDO', 'El archivo supera el máximo de la categoría', 422));
    await montar();
    await soltar(pdf());

    expect(elemento('[data-prueba="falla"]')?.textContent).toContain('El archivo supera el máximo de la categoría');
    expect(subir).not.toHaveBeenCalled();
  });

  it('un corte del SSE deja reintentar el seguimiento sin volver a subir', async () => {
    await montar();
    await subirHastaAnalisis();
    analisis.error(new CorteDeStream());
    await estable(fixture);
    expect(elemento('[data-prueba="falla"]')?.textContent).toContain(MENSAJES_ARCHIVO_CARGA.corteSeguimiento);

    analisis = new Subject();
    pulsar('[data-accion="falla"]');
    await estable(fixture);
    expect(abrirEventos).toHaveBeenCalledTimes(2);
    expect(archivos['solicitarCarga']).toHaveBeenCalledTimes(1);
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.enAnalisis);
  });

  it('modo carga con archivoId en análisis: un GET, reabre el SSE y ante 404 sigue «En análisis» sin seguimiento', async () => {
    archivos['estado'].mockResolvedValueOnce({ archivoId: ARCHIVO_ID, estado: 'EN_ANALISIS', categoria: 'DOCUMENTO', nombreOriginal: 'ajeno.pdf' });
    await montar({ archivoId: ARCHIVO_ID });

    expect(archivos['estado']).toHaveBeenCalledTimes(1);
    expect(abrirEventos).toHaveBeenCalledWith(ARCHIVO_ID, 1);
    analisis.error(new StreamRechazado(404));
    await estable(fixture);
    expect(texto()).toContain(MENSAJES_ARCHIVO_CARGA.enAnalisis);
    expect(texto()).toContain('ajeno.pdf');
    expect(elemento('[data-prueba="falla"]')).toBeNull();
  });

  it('deshabilitado no acepta archivos soltados', async () => {
    await montar({ deshabilitado: true });
    await soltar(pdf(MEGABYTE));
    expect(archivos['solicitarCarga']).not.toHaveBeenCalled();
    expect(elemento<HTMLButtonElement>('[data-accion="elegir"]')?.disabled).toBe(true);
  });
});
