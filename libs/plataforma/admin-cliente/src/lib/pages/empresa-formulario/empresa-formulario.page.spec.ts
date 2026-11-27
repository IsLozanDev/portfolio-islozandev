import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ArchivoCargaComponent, type ArchivoDisponible } from '@vitrina/plataforma/archivos-ui';
import { CONFIG_AUTH, SesionService } from '@vitrina/shared/auth';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { MENSAJES_EMPRESAS, MENSAJES_LOGO_INVALIDO, MENSAJES_ORGANIZACION, MENSAJES_VALIDACION_ORGANIZACION, TEXTOS_UBIGEO_ORGANIZACION } from '../../models/mensajes-organizacion';
import { PERMISO_CONSULTAR_IDENTIDAD } from '../../models/padron';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { EmpresaFormularioPage } from './empresa-formulario.page';

const URL_EMPRESAS = `${API_URL}/org/empresas`;
const URL_PADRON = `${API_URL}/identidad/RUC`;
const RUC_ANDINA = '20512345671';
const RUC_MISTI = '20456789120';
const RUC_FUERA_DEL_PADRON = '20601234565';
const ADVERTENCIA_NO_HABIDO = 'Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar';
const PADRON_ANDINA = { razon_social: 'Comercial Andina S.A.C.', estado: 'ACTIVO', condicion: 'HABIDO', apto_factura: true };
const PADRON_MISTI = { razon_social: 'Inversiones Misti S.A.C.', estado: 'ACTIVO', condicion: 'NO HABIDO', apto_factura: false, motivo_no_apto: 'Condición NO HABIDO' };
const SABORES = {
  id: 'e-sabores',
  ruc: '20512345671',
  razon_social: 'Sabores del Sur SAC',
  nombre_comercial: null,
  direccion_fiscal: 'Av. Ejército 101',
  ubigeo: '040101',
  telefono: null,
  correo: null,
  sitio_web: null,
  logo_archivo_id: null,
  activo: true,
  version: 3,
};

@Component({ selector: 'vit-destino-empresa-formulario', template: '' })
class Destino {}

/** La zona real sube a Storage y sigue el análisis por SSE: aquí solo importa qué recibe y qué avisa. */
@Component({ selector: 'vit-archivo-carga', template: '' })
class ArchivoCargaDoble {
  readonly categoria = input('');
  readonly entidadTipo = input('');
  readonly entidadId = input('');
  readonly etiqueta = input<string | undefined>(undefined);
  readonly deshabilitado = input(false);
  readonly disponible = output<ArchivoDisponible>();
}

const URL_UBIGEOS = `${API_URL}/catalogos/UBIGEO/items`;
const ITEMS_UBIGEO = [
  { codigo: '150122', nombre: 'MIRAFLORES', atributos: { departamento: 'LIMA', provincia: 'LIMA' } },
  { codigo: '040103', nombre: 'CAYMA', atributos: { departamento: 'AREQUIPA', provincia: 'AREQUIPA' } },
];
const PERMISO_SUBIR = 'plat.archivo.subir';
const PERMISO_DESCARGAR = 'plat.archivo.descargar';
const PERMISO_CATALOGO = 'plat.catalogo.leer';
const LOGO_NUEVO = 'logo-nuevo';
const URL_LOGO_NUEVO = 'https://storage.ejemplo/logo-nuevo.png';
const URL_LOGO_GUARDADO = 'https://storage.ejemplo/logo-1.png';
const VIGENCIA_URL_MS = 900_000;

describe('EmpresaFormularioPage', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let avisos: { toast: ReturnType<typeof vi.fn>; advertencia: ReturnType<typeof vi.fn> };
  let sesion: DobleSesion;
  let recarga: { recargar: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const url = () => TestBed.inject(Router).url;
  const campo = (nombre: string) => elemento().querySelector<HTMLInputElement>(`[data-campo=${nombre}]`);

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
  }

  async function abrir(ruta: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'admin',
            children: [
              { path: 'empresas/nueva', component: EmpresaFormularioPage },
              { path: 'empresas/:empresaId/editar', component: EmpresaFormularioPage },
            ],
          },
          { path: '**', component: Destino },
        ]),
        { provide: AvisosService, useValue: avisos },
        { provide: RecargaContextoService, useValue: recarga },
        { provide: SesionService, useValue: sesion },
        { provide: CONFIG_AUTH, useValue: { apiUrl: API_URL } },
      ],
    });
    TestBed.overrideComponent(EmpresaFormularioPage, { remove: { imports: [ArchivoCargaComponent] }, add: { imports: [ArchivoCargaDoble] } });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create(ruta);
    await estable();
  }

  async function abrirEdicion(): Promise<void> {
    await abrir('/admin/empresas/e-sabores/editar');
    http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush(SABORES);
    await estable();
  }

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo(nombre);
    if (!entrada) throw new Error(`No hay campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    await estable();
  }

  async function salirDelRuc(): Promise<void> {
    campo('ruc')?.dispatchEvent(new Event('blur'));
    await estable();
  }

  const padronDe = (ruc: string) => http.expectOne((solicitud) => solicitud.url === `${URL_PADRON}/${ruc}`);
  const ayudaRazonSocial = () => elemento().querySelector('[data-ayuda=razon-social]')?.textContent?.trim();

  async function enviar(): Promise<void> {
    elemento().querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await estable();
  }

  /** Tras registrar, la pantalla pasa a la edición de la empresa nueva y la carga (spec 17d). */
  async function pasarAEdicion(empresaId: string): Promise<void> {
    http.expectOne(`${URL_EMPRESAS}/${empresaId}`).flush({ ...SABORES, id: empresaId });
    await estable();
  }

  const conflicto = (codigo: string, mensaje: string) => ({ body: { codigo, mensaje }, opciones: { status: 409, statusText: 'Conflict' } });

  beforeEach(() => {
    avisos = { toast: vi.fn(), advertencia: vi.fn(async () => undefined) };
    sesion = new DobleSesion().conPermisos(PERMISO_CONSULTAR_IDENTIDAD);
    recarga = { recargar: vi.fn(async () => undefined) };
  });

  afterEach(() => http.verify());

  it('TR-CA-004: registra, recarga mi-contexto y pasa a la edición con el aviso para subir el logo', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345671');
    await escribir('razonSocial', ' Sabores del Sur SAC ');
    await enviar();

    const peticion = http.expectOne(URL_EMPRESAS);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      ruc: '20512345671',
      razon_social: 'Sabores del Sur SAC',
      nombre_comercial: null,
      direccion_fiscal: null,
      ubigeo: null,
      telefono: null,
      correo: null,
      sitio_web: null,
    });
    peticion.flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
    await estable();

    expect(recarga.recargar).toHaveBeenCalled();
    expect(url()).toBe('/admin/empresas/e-sabores/editar');
    await pasarAEdicion('e-sabores');
    expect(elemento().querySelector('[data-aviso=recien-registrada]')?.textContent).toContain('Empresa registrada. Ahora puede subir el logo.');
    expect(avisos.toast).not.toHaveBeenCalled();
  });

  describe('padrón RUC (spec 28b)', () => {
    it('al salir del RUC consulta el padrón con motivo VERIFICACION_IDENTIDAD, prellena la razón social y la deja de solo lectura', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();

      const consulta = padronDe(RUC_ANDINA);
      expect(consulta.request.params.get('motivo')).toBe('VERIFICACION_IDENTIDAD');
      consulta.flush(PADRON_ANDINA);
      await estable();

      expect(campo('razonSocial')?.value).toBe('Comercial Andina S.A.C.');
      expect(campo('razonSocial')?.disabled).toBe(true);
      expect(elemento().querySelector('[data-aviso=no-apto]')).toBeNull();

      await enviar();
      const registro = http.expectOne(URL_EMPRESAS);
      expect(registro.request.body).toMatchObject({ ruc: RUC_ANDINA, razon_social: 'Comercial Andina S.A.C.' });
      registro.flush({ empresa_id: 'e-andina', sucursal_principal_id: 's-centro', advertencias: [] });
      await estable();
      await pasarAEdicion('e-andina');
      expect(avisos.advertencia).not.toHaveBeenCalled();
    });

    it('salir otra vez del campo con el mismo RUC no repite la consulta', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      padronDe(RUC_ANDINA).flush(PADRON_ANDINA);
      await estable();

      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));
    });

    it('un RUC que el padrón no tiene (404) deja la razón social editable con la ayuda', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_FUERA_DEL_PADRON);
      await salirDelRuc();
      padronDe(RUC_FUERA_DEL_PADRON).flush({ codigo: 'NO_ENCONTRADO', mensaje: 'El documento no existe en el proveedor' }, { status: 404, statusText: 'Not Found' });
      await estable();

      expect(campo('razonSocial')?.disabled).toBe(false);
      expect(ayudaRazonSocial()).toBe(MENSAJES_EMPRESAS.noEnPadron);
    });

    it('con el proveedor caído (503) también queda editable con la ayuda', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      padronDe(RUC_ANDINA).flush({ codigo: 'PROVEEDOR_NO_DISPONIBLE', mensaje: 'Ningún proveedor de identidad respondió' }, { status: 503, statusText: 'Service Unavailable' });
      await estable();

      expect(campo('razonSocial')?.disabled).toBe(false);
      expect(ayudaRazonSocial()).toBe(MENSAJES_EMPRESAS.noEnPadron);
    });

    it('cambiar el RUC vuelve a habilitar la razón social y quita la ayuda', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      padronDe(RUC_ANDINA).flush(PADRON_ANDINA);
      await estable();

      await escribir('ruc', '2051234567');

      expect(campo('razonSocial')?.disabled).toBe(false);
      expect(ayudaRazonSocial()).toBe(MENSAJES_EMPRESAS.ayudaRazonSocial);
    });

    it('TR-CA-006: con un RUC NO HABIDO muestra el hint antes de registrar y el aviso después', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_MISTI);
      await salirDelRuc();
      padronDe(RUC_MISTI).flush(PADRON_MISTI);
      await estable();

      expect(elemento().querySelector('[data-aviso=no-apto]')?.textContent?.trim()).toBe('Condición NO HABIDO');

      await enviar();
      http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-misti', sucursal_principal_id: 's-centro', advertencias: [ADVERTENCIA_NO_HABIDO] });
      await estable();

      expect(avisos.advertencia).toHaveBeenCalledWith(MENSAJES_EMPRESAS.registradaConObservaciones, ADVERTENCIA_NO_HABIDO);
      expect(avisos.toast).not.toHaveBeenCalled();
      expect(url()).toBe('/admin/empresas/e-misti/editar');
      await pasarAEdicion('e-misti');
    });

    it('sin plat.identidad.consultar no consulta el padrón y registra con la razón social escrita', async () => {
      sesion.conPermisos();
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', RUC_ANDINA);
      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));

      await escribir('razonSocial', 'Sabores del Sur SAC');
      await enviar();
      http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
      await estable();
      await pasarAEdicion('e-sabores');
      expect(url()).toBe('/admin/empresas/e-sabores/editar');
    });

    it('un RUC inválido no consulta el padrón', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', '20512345678');
      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));
    });

    it('en la edición no consulta el padrón', async () => {
      await abrirEdicion();
      await salirDelRuc();
      http.expectNone((solicitud) => solicitud.url.startsWith(URL_PADRON));
    });
  });

  it('TR-RN-002: con RUC 20512345678 muestra «RUC inválido» y no envía', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345678');
    await escribir('razonSocial', 'Sabores del Sur SAC');
    await enviar();

    expect(elemento().textContent).toContain('RUC inválido');
    http.expectNone(URL_EMPRESAS);
  });

  it('TR-CA-005: un RUC repetido muestra el mensaje de la API y no navega', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345671');
    await escribir('razonSocial', 'Sabores del Sur SAC');
    await enviar();

    const { body, opciones } = conflicto('CONFLICTO', 'La empresa ya está registrada en este tenant');
    http.expectOne(URL_EMPRESAS).flush(body, opciones);
    await estable();

    expect(elemento().querySelector('[data-error=api]')?.textContent).toContain('La empresa ya está registrada en este tenant');
    expect(url()).toBe('/admin/empresas/nueva');
    expect(recarga.recargar).not.toHaveBeenCalled();
  });

  it('un doble envío manda una sola petición', async () => {
    await abrir('/admin/empresas/nueva');
    await escribir('ruc', '20512345671');
    await escribir('razonSocial', 'Sabores del Sur SAC');
    const formulario = elemento().querySelector<HTMLFormElement>('form');
    formulario?.dispatchEvent(new Event('submit'));
    formulario?.dispatchEvent(new Event('submit'));
    await estable();

    http.expectOne(URL_EMPRESAS).flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
    await estable();
    await pasarAEdicion('e-sabores');
  });

  it('la edición carga por id con el RUC en solo lectura y guarda con la versión', async () => {
    await abrirEdicion();

    expect(campo('ruc')?.value).toBe('20512345671');
    expect(campo('ruc')?.disabled).toBe(true);
    expect(campo('razonSocial')?.value).toBe('Sabores del Sur SAC');

    await escribir('nombreComercial', 'Sabores');
    await enviar();

    const peticion = http.expectOne(`${URL_EMPRESAS}/e-sabores`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({
      version: 3,
      razon_social: 'Sabores del Sur SAC',
      nombre_comercial: 'Sabores',
      direccion_fiscal: 'Av. Ejército 101',
      ubigeo: '040101',
      telefono: null,
      correo: null,
      sitio_web: null,
      logo_archivo_id: null,
    });
    peticion.flush(null, { status: 204, statusText: 'No Content' });
    await estable();

    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_EMPRESAS.actualizada);
    expect(url()).toBe('/admin/empresas');
  });

  it('TR-RNF-008: VERSION_OBSOLETA muestra el aviso y «Recargar» trae la versión nueva', async () => {
    await abrirEdicion();
    await escribir('nombreComercial', 'Sabores');
    await enviar();

    const { body, opciones } = conflicto('VERSION_OBSOLETA', 'El registro cambió desde que lo abrió; recargue y vuelva a intentar');
    http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush(body, opciones);
    await estable();

    expect(elemento().querySelector('[data-error=version]')?.textContent).toContain(MENSAJES_ORGANIZACION.versionObsoleta);
    expect(url()).toBe('/admin/empresas/e-sabores/editar');

    elemento().querySelector<HTMLButtonElement>('[data-accion=recargar]')?.click();
    await estable();
    http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush({ ...SABORES, nombre_comercial: 'Del otro usuario', version: 4 });
    await estable();

    expect(campo('nombreComercial')?.value).toBe('Del otro usuario');
    expect(elemento().querySelector('[data-error=version]')).toBeNull();
  });

  it('un id inexistente muestra «La empresa no existe» con enlace a la lista', async () => {
    await abrir('/admin/empresas/e-otra/editar');
    http.expectOne(`${URL_EMPRESAS}/e-otra`).flush({ codigo: 'NO_ENCONTRADO', mensaje: 'La empresa no existe' }, { status: 404, statusText: 'Not Found' });
    await estable();

    expect(elemento().textContent).toContain(MENSAJES_EMPRESAS.noExiste);
    expect(elemento().querySelector('form')).toBeNull();
    expect([...elemento().querySelectorAll('a')].find((enlace) => enlace.textContent?.includes(MENSAJES_EMPRESAS.volver))?.getAttribute('href')).toBe('/admin/empresas');
  });

  it('cancelar vuelve a la lista sin enviar', async () => {
    await abrir('/admin/empresas/nueva');
    [...elemento().querySelectorAll<HTMLButtonElement>('button')].find((boton) => boton.type === 'button')?.click();
    await estable();

    expect(url()).toBe('/admin/empresas');
  });

  describe('identidad y contacto (spec 17d)', () => {
    const zona = () => harness.fixture.debugElement.query(By.directive(ArchivoCargaDoble))?.componentInstance as ArchivoCargaDoble | undefined;
    const enPagina = (selector: string) => elemento().querySelector<HTMLElement>(selector);
    const expiraEnUnRato = () => new Date(Date.now() + VIGENCIA_URL_MS).toISOString();
    const descargaDe = (archivoId: string) => http.expectOne((solicitud) => solicitud.url === `${API_URL}/archivos/${archivoId}/descarga`);
    const edicion = () => http.expectOne((solicitud) => solicitud.method === 'PUT' && solicitud.url === `${URL_EMPRESAS}/e-sabores`);
    const imagenDelLogo = () => elemento().querySelector<HTMLImageElement>('vit-logo-empresa img');

    async function abrirEdicionCon(cambios: object): Promise<void> {
      await abrir('/admin/empresas/e-sabores/editar');
      http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush({ ...SABORES, ...cambios });
      await estable();
    }

    async function subirLogo(): Promise<void> {
      zona()?.disponible.emit({ archivoId: LOGO_NUEVO, numero: 1 });
      await estable();
      descargaDe(LOGO_NUEVO).flush({ url: URL_LOGO_NUEVO, expira_en: expiraEnUnRato() });
      await estable();
    }

    async function salirDe(nombre: string): Promise<void> {
      campo(nombre)?.dispatchEvent(new Event('blur'));
      await estable();
    }

    async function guardarSinError(): Promise<void> {
      edicion().flush(null, { status: 204, statusText: 'No Content' });
      await estable();
    }

    it('en el alta la zona del logo está deshabilitada y el contacto se llena y viaja normalizado', async () => {
      sesion.conPermisos(PERMISO_SUBIR);
      await abrir('/admin/empresas/nueva');

      expect(zona()?.deshabilitado()).toBe(true);
      expect(enPagina('[data-ayuda=logo-al-registrar]')?.textContent).toContain(MENSAJES_EMPRESAS.logoAlRegistrar);

      await escribir('ruc', '20512345671');
      await escribir('razonSocial', 'Sabores del Sur SAC');
      await escribir('telefono', '987654321');
      await escribir('correo', 'Ventas@Empresa.PE');
      await escribir('sitioWeb', 'www.empresa.pe');
      await salirDe('sitioWeb');
      expect(campo('telefono')?.value).toBe('987 654 321');
      expect(campo('sitioWeb')?.value).toBe('https://www.empresa.pe');

      await enviar();
      const peticion = http.expectOne(URL_EMPRESAS);
      expect(peticion.request.body).toMatchObject({ telefono: '+51987654321', correo: 'ventas@empresa.pe', sitio_web: 'https://www.empresa.pe' });
      peticion.flush({ empresa_id: 'e-sabores', sucursal_principal_id: 's-centro', advertencias: [] });
      await estable();
      await pasarAEdicion('e-sabores');

      expect(zona()?.deshabilitado()).toBe(false);
      expect(zona()?.entidadId()).toBe('e-sabores');
      expect([zona()?.categoria(), zona()?.entidadTipo()]).toEqual(['LOGO', 'EMPRESA']);
    });

    it('un logo subido queda pendiente con su miniatura y se asigna con «Guardar cambios»', async () => {
      sesion.conPermisos(PERMISO_SUBIR, PERMISO_DESCARGAR);
      await abrirEdicion();
      expect(enPagina('[data-chip=logo-pendiente]')).toBeNull();

      await subirLogo();
      expect(enPagina('[data-chip=logo-pendiente]')?.textContent).toContain(MENSAJES_EMPRESAS.logoPendiente);
      expect(imagenDelLogo()?.src).toBe(URL_LOGO_NUEVO);

      await enviar();
      expect(edicion().request.body).toMatchObject({ version: 3, logo_archivo_id: LOGO_NUEVO });
    });

    it('«Quitar logo» muestra la inicial y guarda logo_archivo_id en null', async () => {
      sesion.conPermisos(PERMISO_SUBIR, PERMISO_DESCARGAR);
      await abrirEdicionCon({ logo_archivo_id: 'logo-1' });
      descargaDe('logo-1').flush({ url: URL_LOGO_GUARDADO, expira_en: expiraEnUnRato() });
      await estable();
      expect(imagenDelLogo()?.src).toBe(URL_LOGO_GUARDADO);

      enPagina('[data-accion=quitar-logo]')?.click();
      await estable();
      expect(imagenDelLogo()).toBeNull();
      expect(enPagina('[data-prueba=inicial-logo]')?.textContent?.trim()).toBe('S');
      expect(enPagina('[data-chip=logo-por-quitar]')).not.toBeNull();

      await enviar();
      expect(edicion().request.body).toMatchObject({ logo_archivo_id: null });
    });

    it.each(['OTRA_ENTIDAD', 'NO_DISPONIBLE'] as const)('LOGO_INVALIDO %s se muestra bajo la zona del logo', async (motivo) => {
      sesion.conPermisos(PERMISO_SUBIR, PERMISO_DESCARGAR);
      await abrirEdicion();
      await subirLogo();
      await enviar();

      edicion().flush({ codigo: 'LOGO_INVALIDO', mensaje: 'El archivo no sirve como logo de esta empresa', motivo }, { status: 400, statusText: 'Bad Request' });
      await estable();

      expect(enPagina('[data-zona=logo] [data-error=logo]')?.textContent).toContain(MENSAJES_LOGO_INVALIDO[motivo]);
      expect(enPagina('[data-error=api]')).toBeNull();
      expect(url()).toBe('/admin/empresas/e-sabores/editar');
    });

    it('con una versión vieja conserva el logo recién subido, también al recargar', async () => {
      sesion.conPermisos(PERMISO_SUBIR, PERMISO_DESCARGAR);
      await abrirEdicion();
      await subirLogo();
      await enviar();
      const { body, opciones } = conflicto('VERSION_OBSOLETA', 'El registro cambió desde que lo abrió; recargue y vuelva a intentar');
      edicion().flush(body, opciones);
      await estable();
      expect(enPagina('[data-chip=logo-pendiente]')).not.toBeNull();

      enPagina('[data-accion=recargar]')?.click();
      await estable();
      http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush({ ...SABORES, version: 4 });
      await estable();
      expect(enPagina('[data-chip=logo-pendiente]')).not.toBeNull();
      expect(imagenDelLogo()?.src).toBe(URL_LOGO_NUEVO);

      await enviar();
      expect(edicion().request.body).toMatchObject({ version: 4, logo_archivo_id: LOGO_NUEVO });
    });

    it('guardar con el logo nuevo navega a la lista', async () => {
      sesion.conPermisos(PERMISO_SUBIR, PERMISO_DESCARGAR);
      await abrirEdicion();
      await subirLogo();
      await enviar();
      await guardarSinError();

      expect(url()).toBe('/admin/empresas');
    });

    it('sin plat.archivo.subir no muestra la zona de carga y avisa', async () => {
      await abrirEdicion();

      expect(zona()).toBeUndefined();
      expect(enPagina('[data-aviso=sin-permiso-subir]')?.textContent).toContain(MENSAJES_EMPRESAS.sinPermisoSubir);
      expect(enPagina('[data-accion=quitar-logo]')).toBeNull();
    });

    it('sin plat.archivo.descargar muestra la inicial sin pedir la URL del logo', async () => {
      sesion.conPermisos(PERMISO_SUBIR);
      await abrirEdicionCon({ logo_archivo_id: 'logo-1' });

      http.expectNone((solicitud) => solicitud.url.includes('/archivos/'));
      expect(imagenDelLogo()).toBeNull();
      expect(enPagina('[data-prueba=inicial-logo]')?.textContent?.trim()).toBe('S');
    });

    it('con el catálogo, el ubigeo guardado se muestra con su nombre y uno nuevo se elige de la lista', async () => {
      sesion.conPermisos(PERMISO_CATALOGO);
      await abrir('/admin/empresas/e-sabores/editar');
      http.expectOne(`${URL_EMPRESAS}/e-sabores`).flush({ ...SABORES, ubigeo: '150122' });
      await estable();
      http.expectOne(URL_UBIGEOS).flush(ITEMS_UBIGEO);
      await estable();

      expect(campo('ubigeo')?.value).toBe('LIMA / LIMA / MIRAFLORES');
      expect(enPagina('[data-prueba=ayuda-ubigeo]')?.textContent?.trim()).toBe('Se guarda el código 150122.');

      campo('ubigeo')?.focus();
      await escribir('ubigeo', 'cayma');
      const opciones = [...document.querySelectorAll<HTMLElement>('[data-prueba="opcion-ubigeo"]')];
      expect(opciones.map((opcion) => opcion.textContent?.trim())).toEqual(['AREQUIPA / AREQUIPA / CAYMA']);
      opciones[0]?.click();
      await estable();
      expect(campo('ubigeo')?.value).toBe('AREQUIPA / AREQUIPA / CAYMA');

      await enviar();
      expect(edicion().request.body).toMatchObject({ ubigeo: '040103' });
    });

    it('un distrito escrito sin elegirlo de la lista muestra «Elija un distrito de la lista» y no envía', async () => {
      sesion.conPermisos(PERMISO_CATALOGO);
      await abrir('/admin/empresas/nueva');
      http.expectOne(URL_UBIGEOS).flush(ITEMS_UBIGEO);
      await escribir('ruc', '20512345671');
      await escribir('razonSocial', 'Sabores del Sur SAC');
      await escribir('ubigeo', 'cayma');
      await enviar();

      http.expectNone(URL_EMPRESAS);
      expect(enPagina('vit-ubigeo-autocompletar mat-error')?.textContent?.trim()).toBe(TEXTOS_UBIGEO_ORGANIZACION.error);
    });

    it('sin plat.catalogo.leer el ubigeo queda deshabilitado con su aviso y conserva el código', async () => {
      await abrirEdicion();

      http.expectNone(URL_UBIGEOS);
      expect(campo('ubigeo')?.disabled).toBe(true);
      expect(campo('ubigeo')?.value).toBe('040101');
      expect(enPagina('[data-prueba=ayuda-ubigeo]')?.textContent?.trim()).toBe(TEXTOS_UBIGEO_ORGANIZACION.sinPermiso);
    });

    it('un celular incompleto muestra su error y no envía', async () => {
      await abrir('/admin/empresas/nueva');
      await escribir('ruc', '20512345671');
      await escribir('razonSocial', 'Sabores del Sur SAC');
      await escribir('telefono', '98765');
      await enviar();

      http.expectNone(URL_EMPRESAS);
      const errores = [...elemento().querySelectorAll('mat-error')].map((mensaje) => mensaje.textContent?.trim());
      expect(errores).toContain(MENSAJES_VALIDACION_ORGANIZACION.telefonoPeru);
    });
  });
});
