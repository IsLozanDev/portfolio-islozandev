import type { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { DobleSesion } from '../../../testing/doble-sesion';
import { AHORA, EMPRESA_ID, respuestaEmisorDePrueba } from '../../../testing/emisor-de-prueba';
import { API_URL, prepararHttpDePrueba } from '../../../testing/http-de-prueba';
import type { EmisorRespuesta } from '../../models/emisor';
import { PERMISOS_FE_UI } from '../../models/permisos-fe';
import { INTERVALO_CONSULTA_PRUEBA_MS } from '../../services/seguimiento-prueba.service';
import { EmisorConfiguracionPage } from './emisor-configuracion.page';

const URL_EMISORES = `${API_URL}/fe/emisores`;
const URL_EMISOR = `${URL_EMISORES}/${EMPRESA_ID}`;
const URL_PROVEEDORES = `${API_URL}/catalogos/PROVEEDOR_FE/items`;
const RUTA = `/admin/fe/emisores/${EMPRESA_ID}`;

const EMPRESA = { empresa_id: EMPRESA_ID, ruc: '20601234561', razon_social: 'Inversiones Sur Andino SAC', emisor: null };
const SUNAT = { codigo: 'SUNAT', nombre: 'SUNAT directo', atributos: { dominios_permitidos: ['e-beta.sunat.gob.pe'], url_produccion: 'https://e-factura.sunat.gob.pe' } };
const NUBEFACT = { codigo: 'NUBEFACT', nombre: 'Nubefact', atributos: { requiere_certificado: false, dominios_permitidos: ['api.nubefact.com'] } };
const ACEPTADA = { estado: 'ACEPTADA' as const, numero: 1, solicitada_en: '2026-11-25T14:59:00.000Z', resultado_en: '2026-11-25T14:59:06.000Z', codigo: '0', descripcion: 'Aceptada' };

@Component({ selector: 'vit-destino-emisor', template: '' })
class Destino {}

describe('EmisorConfiguracionPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sesion: DobleSesion;
  let avisos: { toast: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const seccion = (nombre: string) => elemento().querySelector(`[data-seccion=${nombre}]`) as HTMLElement;
  const expandida = (nombre: string) => seccion(nombre).querySelector('.disparador')?.getAttribute('aria-expanded') === 'true';
  const boton = (accion: string) => elemento().querySelector(`[data-accion=${accion}]`) as HTMLButtonElement | null;

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(emisor: EmisorRespuesta | null, proveedores: object[] = [SUNAT]): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin/fe/emisores/:empresaId', component: EmisorConfiguracionPage },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    http = prepararHttpDePrueba();
    harness = await RouterTestingHarness.create(RUTA);
    await estable();
    http.expectOne(URL_PROVEEDORES).flush(proveedores);
    http.expectOne({ method: 'GET', url: URL_EMISORES }).flush([EMPRESA]);
    const lectura = http.expectOne({ method: 'GET', url: URL_EMISOR });
    if (emisor) lectura.flush(emisor);
    else lectura.flush({ codigo: 'EMISOR_NO_ENCONTRADO' }, { status: 404, statusText: 'Not Found' });
    await estable();
  }

  async function responder(peticion: TestRequest, cuerpo: object, opciones?: { status: number; statusText: string }): Promise<void> {
    peticion.flush(cuerpo, opciones);
    await estable();
  }

  async function escribir(campo: string, valor: string): Promise<void> {
    const entrada = elemento().querySelector(`[data-campo=${campo}]`) as HTMLInputElement;
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    await estable();
  }

  async function pulsar(accion: string): Promise<void> {
    boton(accion)?.click();
    await estable();
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    sesion = new DobleSesion().conPermisos(PERMISOS_FE_UI.consultar, PERMISOS_FE_UI.configurar);
    avisos = { toast: vi.fn(), confirmarDestructiva: vi.fn(async () => ({ confirmado: false })) };
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('encabezado con la empresa y el estado; en CONFIGURADO solo «Prueba en beta» está expandida', async () => {
    await abrir(respuestaEmisorDePrueba());

    expect(elemento().querySelector('h1')?.textContent).toContain('Inversiones Sur Andino SAC');
    expect(elemento().querySelector('[data-chip=estado]')?.textContent?.trim()).toBe('Configurado');
    expect(['proveedor', 'certificado', 'prueba', 'produccion'].map(expandida)).toEqual([false, false, true, false]);
    expect(seccion('proveedor').textContent).toContain('SUNAT directo · MODDATOS');
    expect(seccion('certificado').textContent).toContain('RUC 20601234561 · vence 30/06/27');
  });

  it('con SUNAT: «Usuario secundario SOL», sin URL y la clave vacía con «Configurada…»', async () => {
    await abrir(respuestaEmisorDePrueba());

    expect(seccion('proveedor').textContent).toContain('Usuario secundario SOL');
    expect(elemento().querySelector('[data-campo=url]')).toBeNull();
    expect((elemento().querySelector('[data-campo=clave]') as HTMLInputElement).value).toBe('');
    expect(elemento().querySelector('[data-ayuda=clave]')?.textContent).toContain('Configurada. Déjalo vacío para conservarla.');
  });

  it('con un proveedor que pide URL, el campo aparece y es obligatorio', async () => {
    await abrir(respuestaEmisorDePrueba({ proveedor: 'NUBEFACT', url_proveedor: null }), [SUNAT, NUBEFACT]);

    const url = elemento().querySelector('[data-campo=url]') as HTMLInputElement;
    expect(url).not.toBeNull();
    expect(url.required).toBe(true);
  });

  it('sin emisor: guardar crea con PUT sin version, contrae el proveedor y abre el certificado', async () => {
    await abrir(null);
    expect(expandida('proveedor')).toBe(true);
    expect(seccion('certificado').textContent).toContain('Guarda primero el proveedor');

    await escribir('usuario', 'MODDATOS');
    // El proveedor se elige en el mat-select; aquí basta con el valor del control.
    const proveedor = harness.fixture.debugElement.query((nodo) => nodo.name === 'vit-tarjeta-proveedor').componentInstance as { grupo: { controls: { proveedor: { setValue(v: string): void } } } };
    proveedor.grupo.controls.proveedor.setValue('SUNAT');
    await estable();
    await pulsar('guardar');

    const peticion = http.expectOne({ method: 'PUT', url: URL_EMISOR });
    expect(peticion.request.body).toEqual({ proveedor: 'SUNAT', usuario_proveedor: 'MODDATOS', regimen_igv: 'GENERAL', leyenda_pie: null });
    await responder(peticion, respuestaEmisorDePrueba({ estado: 'BORRADOR', certificado: null, tiene_credencial: false, version: 1 }), { status: 201, statusText: 'Created' });

    expect(expandida('proveedor')).toBe(false);
    expect(expandida('certificado')).toBe(true);
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Proveedor guardado.');
  });

  it('409 VERSION_OBSOLETA avisa y recarga el emisor', async () => {
    await abrir(respuestaEmisorDePrueba());
    await pulsar('guardar');
    await responder(http.expectOne({ method: 'PUT', url: URL_EMISOR }), { codigo: 'VERSION_OBSOLETA' }, { status: 409, statusText: 'Conflict' });

    expect(avisos.toast).toHaveBeenCalledWith('advertencia', 'Otro usuario cambió el emisor. Se recargaron los datos.');
    await responder(http.expectOne({ method: 'GET', url: URL_EMISOR }), respuestaEmisorDePrueba({ version: 4 }));
  });

  it('422 DATOS_EMISOR_INCOMPLETOS muestra el mensaje y el enlace a la empresa', async () => {
    await abrir(respuestaEmisorDePrueba());
    await pulsar('guardar');
    await responder(http.expectOne({ method: 'PUT', url: URL_EMISOR }), { codigo: 'DATOS_EMISOR_INCOMPLETOS' }, { status: 422, statusText: 'Unprocessable' });

    expect(elemento().querySelector('[data-error=proveedor]')?.textContent).toContain('Falta el domicilio fiscal o el ubigeo de la empresa.');
    expect(boton('completar-empresa')?.getAttribute('href')).toBe(`/admin/empresas/${EMPRESA_ID}/editar`);
  });

  it('un archivo .txt o de más de 50 KB se rechaza sin llamar a la API', async () => {
    await abrir(respuestaEmisorDePrueba());
    const selector = elemento().querySelector('[data-campo=archivo]') as HTMLInputElement;
    const elegir = async (archivo: File) => {
      Object.defineProperty(selector, 'files', { value: [archivo], configurable: true });
      selector.dispatchEvent(new Event('change'));
      await estable();
    };

    await elegir(new File(['x'], 'certificado.txt'));
    expect(elemento().querySelector('[data-error=certificado]')?.textContent).toContain('El archivo no es un certificado .pfx válido.');
    await elegir(new File([new Uint8Array(51 * 1024)], 'grande.pfx'));
    expect(elemento().querySelector('[data-error=certificado]')?.textContent).toContain('El archivo supera los 50 KB.');
    expect(boton('subir')?.disabled).toBe(true);
    http.expectNone(`${URL_EMISOR}/certificado`);
  });

  it('CERTIFICADO_OTRO_RUC muestra el error y el certificado anterior se sigue viendo (TR-CA-134)', async () => {
    await abrir(respuestaEmisorDePrueba());
    const selector = elemento().querySelector('[data-campo=archivo]') as HTMLInputElement;
    Object.defineProperty(selector, 'files', { value: [new File([new Uint8Array(10)], 'otro.pfx')], configurable: true });
    selector.dispatchEvent(new Event('change'));
    await escribir('clave-certificado', 'clave-pfx');
    await pulsar('subir');

    await responder(http.expectOne({ method: 'POST', url: `${URL_EMISOR}/certificado` }), { codigo: 'CERTIFICADO_OTRO_RUC' }, { status: 422, statusText: 'Unprocessable' });
    expect(elemento().querySelector('[data-error=certificado]')?.textContent).toContain('El certificado no corresponde al RUC de la empresa.');
    expect(elemento().querySelector('[data-certificado=actual]')?.textContent).toContain('20601234561');
  });

  it('TR-CA-133: «Ejecutar prueba» queda en proceso y, sin recargar, pasa a aceptada; el encabezado dice «Verificado»', async () => {
    await abrir(respuestaEmisorDePrueba());
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(AHORA);
    await pulsar('probar');
    const enProceso = respuestaEmisorDePrueba({ prueba: { ...ACEPTADA, estado: 'EN_PROCESO', resultado_en: null, codigo: null, descripcion: null } });
    await responder(http.expectOne({ method: 'POST', url: `${URL_EMISOR}/prueba` }), enProceso, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(0);
    await responder(http.expectOne({ method: 'GET', url: URL_EMISOR }), enProceso);
    expect(elemento().querySelector('[data-prueba=en-proceso]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(INTERVALO_CONSULTA_PRUEBA_MS);
    await responder(http.expectOne({ method: 'GET', url: URL_EMISOR }), respuestaEmisorDePrueba({ estado: 'VERIFICADO', prueba: ACEPTADA }));

    expect(elemento().querySelector('[data-prueba=aceptada]')?.textContent).toContain('Conexión correcta: comprobante de prueba aceptado');
    expect(elemento().querySelector('[data-chip=estado]')?.textContent?.trim()).toBe('Verificado');
    expect(boton('produccion')?.disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(INTERVALO_CONSULTA_PRUEBA_MS);
    http.expectNone(URL_EMISOR);
  });

  it('al salir de la página con la prueba en curso no quedan consultas', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(AHORA);
    const enProceso = respuestaEmisorDePrueba({ prueba: { ...ACEPTADA, estado: 'EN_PROCESO', resultado_en: null, codigo: null, descripcion: null } });
    await abrir(enProceso);
    await vi.advanceTimersByTimeAsync(0);
    await responder(http.expectOne({ method: 'GET', url: URL_EMISOR }), enProceso);

    await harness.navigateByUrl('/admin/fe/emisores');
    await vi.advanceTimersByTimeAsync(INTERVALO_CONSULTA_PRUEBA_MS * 3);
    http.expectNone(URL_EMISOR);
  });

  it('«Pasar a producción» abre la confirmación destructiva y cancelar no llama a la API', async () => {
    await abrir(respuestaEmisorDePrueba({ estado: 'VERIFICADO', prueba: ACEPTADA }));
    expect(expandida('produccion')).toBe(true);
    await pulsar('produccion');

    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith(expect.objectContaining({ titulo: '¿Pasar a producción?', textoConfirmar: 'Pasar a producción' }));
    http.expectNone(`${URL_EMISOR}/produccion`);
  });

  it('con la prueba de más de 24 h, producción está deshabilitada y dice por qué', async () => {
    await abrir(respuestaEmisorDePrueba({ estado: 'VERIFICADO', prueba: { ...ACEPTADA, resultado_en: '2026-11-24T14:00:00.000Z' } }));

    expect(boton('produccion')?.disabled).toBe(true);
    expect(seccion('produccion').textContent).toContain('La prueba venció: vuelve a probar');
  });

  it('solo con plat.fe.consultar se ve en solo lectura, sin guardar, subir, probar ni producción', async () => {
    sesion.conPermisos(PERMISOS_FE_UI.consultar);
    await abrir(respuestaEmisorDePrueba({ estado: 'VERIFICADO', prueba: ACEPTADA }));

    for (const accion of ['guardar', 'descartar', 'elegir-archivo', 'subir', 'probar', 'produccion']) {
      expect(boton(accion)).toBeNull();
    }
    expect((elemento().querySelector('[data-campo=usuario]') as HTMLInputElement).disabled).toBe(true);
  });
});
