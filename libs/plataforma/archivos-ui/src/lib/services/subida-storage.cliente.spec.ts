import { HttpEventType, provideHttpClient, withInterceptors, type HttpInterceptorFn } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CargaFirmada } from '../models/archivo';
import { ErrorArchivos } from '../models/error-archivos';
import { SubidaStorageCliente, type AvanceSubida } from './subida-storage.cliente';

const CARGA: CargaFirmada = { url: 'https://storage.test/object/upload/sign/arc/obj-1?token=firma', token: 'firma', expiraEn: '2026-11-22T12:00:00Z' };
const MIME_PDF = 'application/pdf';
const TAMANO = 1000;

/** Pone credenciales a todo: si la subida pasara por los interceptores, llegarían a Storage. */
const credencialesEnTodo: HttpInterceptorFn = (peticion, siguiente) =>
  siguiente(peticion.clone({ setHeaders: { Authorization: 'Bearer secreto', 'X-Sucursal-Id': 'suc-1' } }));

describe('SubidaStorageCliente', () => {
  let cliente: SubidaStorageCliente;
  let http: HttpTestingController;
  const archivo = new File([new Uint8Array(TAMANO)], 'contrato.pdf', { type: MIME_PDF });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([credencialesEnTodo])), provideHttpClientTesting()] });
    cliente = TestBed.inject(SubidaStorageCliente);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('hace PUT del File a la URL firmada con el Content-Type declarado, sin Authorization ni X-Sucursal-Id', () => {
    cliente.subir(CARGA, archivo, MIME_PDF).subscribe();

    const peticion = http.expectOne({ method: 'PUT', url: CARGA.url });
    expect(peticion.request.body).toBe(archivo);
    expect(peticion.request.headers.get('Content-Type')).toBe(MIME_PDF);
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    expect(peticion.request.headers.has('X-Sucursal-Id')).toBe(false);
    expect(peticion.request.reportProgress).toBe(true);
    peticion.flush({});
  });

  it('emite progreso creciente hasta 100 y después terminado', () => {
    const avances: AvanceSubida[] = [];
    let completo = false;
    cliente.subir(CARGA, archivo, MIME_PDF).subscribe({ next: (avance) => avances.push(avance), complete: () => (completo = true) });

    const peticion = http.expectOne(CARGA.url);
    peticion.event({ type: HttpEventType.Sent });
    for (const cargados of [250, 600, TAMANO]) peticion.event({ type: HttpEventType.UploadProgress, loaded: cargados, total: TAMANO });
    peticion.flush({});

    expect(avances).toEqual([
      { tipo: 'progreso', porcentaje: 25 },
      { tipo: 'progreso', porcentaje: 60 },
      { tipo: 'progreso', porcentaje: 100 },
      { tipo: 'terminado' },
    ]);
    expect(completo).toBe(true);
  });

  it('desuscribirse cancela el PUT', () => {
    const suscripcion = cliente.subir(CARGA, archivo, MIME_PDF).subscribe();
    const peticion = http.expectOne(CARGA.url);

    suscripcion.unsubscribe();
    expect(peticion.cancelled).toBe(true);
  });

  it('un error de Storage sale como ErrorArchivos con el estado', () => {
    let fallo: unknown;
    cliente.subir(CARGA, archivo, MIME_PDF).subscribe({ error: (error: unknown) => (fallo = error) });

    http.expectOne(CARGA.url).flush({ error: 'Duplicate' }, { status: 409, statusText: 'Conflict' });
    expect(fallo).toBeInstanceOf(ErrorArchivos);
    expect(fallo).toMatchObject({ estado: 409 });
  });
});
