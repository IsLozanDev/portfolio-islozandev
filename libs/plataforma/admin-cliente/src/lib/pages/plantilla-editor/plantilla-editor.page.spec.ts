import type { TestRequest } from '@angular/common/http/testing';
import { abrirAdmin, crearDobleAvisos, type AdminDePrueba, type DobleAvisosCatalogos } from '../../../testing/catalogos-de-prueba';
import { DobleSesion } from '../../../testing/doble-sesion';
import { detalleSuscripcion, URL_SUSCRIPCION, VISTA_PREVIA } from '../../../testing/plantillas-de-prueba';
import { MENSAJES_EDITOR_PLANTILLA } from '../../models/mensajes-plantillas';
import { PERMISOS_PLANTILLAS } from '../../models/permisos-plantillas';

const RUTA = '/admin/plantillas/SUSCRIPCION_POR_VENCER/CORREO';
const URL_VISTA_PREVIA = `${URL_SUSCRIPCION}/vista-previa`;
/** Un poco más que la espera de 600 ms de la vista previa. */
const ESPERA_DEBOUNCE_MS = 700;
const GESTIONAR = [PERMISOS_PLANTILLAS.consultar, PERMISOS_PLANTILLAS.gestionar];

describe('PlantillaEditorPage (admin)', () => {
  let pantalla: AdminDePrueba;
  let avisos: DobleAvisosCatalogos;

  const elemento = () => pantalla.elemento();
  const campo = <Elemento extends HTMLInputElement | HTMLTextAreaElement>(nombre: string) =>
    elemento().querySelector<Elemento>(`[data-campo="${nombre}"]`) as Elemento;
  const boton = (nombre: string) => elemento().querySelector<HTMLButtonElement>(`[data-accion="${nombre}"]`);
  const errorDe = (nombre: string) => elemento().querySelector(`[data-error="${nombre}"]`)?.textContent?.trim() ?? null;
  const pedidosDeVistaPrevia = (): TestRequest[] => pantalla.http.match({ method: 'POST', url: URL_VISTA_PREVIA });
  const esperarDebounce = async () => {
    await new Promise((resolver) => setTimeout(resolver, ESPERA_DEBOUNCE_MS));
    await pantalla.estable();
  };

  async function escribir(nombre: string, texto: string): Promise<void> {
    const control = campo(nombre);
    control.value = texto;
    control.dispatchEvent(new Event('input'));
    await pantalla.estable();
  }

  async function abrir(permisos: string[] = GESTIONAR, detalle = detalleSuscripcion()): Promise<void> {
    avisos = crearDobleAvisos();
    pantalla = await abrirAdmin(RUTA, new DobleSesion().conPermisos(...permisos), avisos);
    pantalla.http.expectOne({ method: 'GET', url: URL_SUSCRIPCION }).flush(detalle);
    await pantalla.estable();
  }

  async function responderVistaPreviaInicial(): Promise<void> {
    await esperarDebounce();
    pedidosDeVistaPrevia().forEach((pedido) => pedido.flush(VISTA_PREVIA));
    await pantalla.estable();
  }

  afterEach(() => pantalla.http.verify());

  it('muestra el nombre con el código debajo, el origen y el aviso de que rige la base', async () => {
    await abrir();
    await responderVistaPreviaInicial();

    expect(elemento().querySelector('h1')?.textContent?.trim()).toBe('Aviso de suscripción por vencer');
    expect(elemento().querySelector('[data-codigo]')?.textContent).toBe('SUSCRIPCION_POR_VENCER');
    expect(elemento().querySelector('[data-origen]')?.textContent?.trim()).toBe('Base');
    expect(elemento().querySelector('[data-aviso="base"]')).not.toBeNull();
    expect(elemento().querySelector('[data-contador]')?.textContent?.trim()).toBe('52/150');
    expect(boton('guardar')?.disabled).toBe(true);
  });

  it('la vista previa se pide sola 600 ms después de escribir, con el texto del editor, y se pinta en un iframe con sandbox vacío', async () => {
    await abrir();
    await responderVistaPreviaInicial();

    await escribir('cuerpo', '<p>Hola {{tenant}}</p>');
    expect(pedidosDeVistaPrevia()).toEqual([]);
    await esperarDebounce();

    const [pedido] = pedidosDeVistaPrevia();
    expect(pedido.request.body).toEqual({ asunto: detalleSuscripcion().asunto, cuerpo: '<p>Hola {{tenant}}</p>' });
    pedido.flush({ asunto: 'Asunto', cuerpo_html: '<p>Hola Restaurante El Buen Sabor</p>' });
    await pantalla.estable();

    const marco = elemento().querySelector('iframe');
    expect(marco?.getAttribute('sandbox')).toBe('');
    expect(marco?.getAttribute('srcdoc')).toContain('<p>Hola Restaurante El Buen Sabor</p>');
    expect(elemento().querySelector('[data-cambios]')).not.toBeNull();
  });

  it('TR-CA-185: {{diagnostico}} muestra el error al instante, deshabilita «Guardar» y no pide vista previa', async () => {
    await abrir();
    await responderVistaPreviaInicial();

    await escribir('cuerpo', '<p>{{diagnostico}}</p>');

    expect(errorDe('cuerpo')).toBe('Variable no permitida: diagnostico');
    expect(boton('guardar')?.disabled).toBe(true);
    expect(elemento().querySelector('[data-vista-previa]')?.classList).toContain('opacity-50');
    await esperarDebounce();
    expect(pedidosDeVistaPrevia()).toEqual([]);
  });

  it('el chip de una variable inserta {{nombre}} en el cursor del último campo enfocado', async () => {
    await abrir();
    await responderVistaPreviaInicial();
    const asunto = campo<HTMLInputElement>('asunto');
    asunto.dispatchEvent(new Event('focus'));
    asunto.setSelectionRange(0, 0);
    await pantalla.estable();

    elemento().querySelector<HTMLButtonElement>('[data-variable="tenant"]')?.click();
    await pantalla.estable();

    expect(asunto.value).toBe('{{tenant}}' + detalleSuscripcion().asunto);
    expect(elemento().textContent).toContain(MENSAJES_EDITOR_PLANTILLA.insertarVariable('asunto'));
    await esperarDebounce();
    pedidosDeVistaPrevia().forEach((pedido) => pedido.flush(VISTA_PREVIA));
  });

  it('el asunto no deja guardar con más de 150 caracteres y no admite saltos de línea', async () => {
    await abrir();
    await responderVistaPreviaInicial();

    await escribir('asunto', 'a'.repeat(151));
    expect(elemento().querySelector('[data-contador]')?.textContent?.trim()).toBe('151/150');
    expect(errorDe('asunto')).toBe('El asunto pasa de 150 caracteres');
    expect(boton('guardar')?.disabled).toBe(true);

    // Un <input> de texto quita los saltos de línea: el asunto no llega con uno (la regla la prueba validacion-plantilla).
    await escribir('asunto', 'Dos\nlíneas');
    expect(campo('asunto').value).toBe('Doslíneas');
  });

  it('«Base» muestra la plantilla original sin tocar el texto del editor', async () => {
    await abrir(GESTIONAR, detalleSuscripcion({ origen: 'PERSONALIZADA', version: 3, cuerpo: '<p>Propio {{tenant}}</p>' }));
    await responderVistaPreviaInicial();

    elemento().querySelector<HTMLButtonElement>('[data-selector="version"] mat-button-toggle:last-child button')?.click();
    await pantalla.estable();
    await new Promise((resolver) => setTimeout(resolver));

    const [pedido] = pedidosDeVistaPrevia();
    expect(pedido.request.body).toEqual({ asunto: detalleSuscripcion().base.asunto, cuerpo: detalleSuscripcion().base.cuerpo });
    pedido.flush(VISTA_PREVIA);
    await pantalla.estable();
    expect(campo('cuerpo').value).toBe('<p>Propio {{tenant}}</p>');
  });

  it('guardar envía la versión leída; si el servidor quitó contenido avisa y el editor toma el cuerpo saneado', async () => {
    await abrir();
    await responderVistaPreviaInicial();
    await escribir('cuerpo', '<p onclick="robar()">Hola {{tenant}}</p><script>alert(1)</script>');

    boton('guardar')?.click();
    await pantalla.estable();
    const pedido = pantalla.http.expectOne({ method: 'PUT', url: URL_SUSCRIPCION });
    expect(pedido.request.body).toEqual({
      asunto: detalleSuscripcion().asunto,
      cuerpo: '<p onclick="robar()">Hola {{tenant}}</p><script>alert(1)</script>',
      version: null,
    });
    pedido.flush(detalleSuscripcion({ origen: 'PERSONALIZADA', version: 1, cuerpo: '<p>Hola {{tenant}}</p>' }));
    await pantalla.estable();

    expect(campo('cuerpo').value).toBe('<p>Hola {{tenant}}</p>');
    expect(elemento().querySelector('[data-aviso="saneado"]')?.textContent).toContain('Guardada como versión 1.');
    expect(elemento().querySelector('[data-origen]')?.textContent?.trim()).toBe('Personalizada · v1');
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_EDITOR_PLANTILLA.guardadaComo(1));
    expect(boton('guardar')?.disabled).toBe(true);
    await esperarDebounce();
    pedidosDeVistaPrevia().forEach((previa) => previa.flush(VISTA_PREVIA));
  });

  it('el 400 VARIABLE_NO_PERMITIDA del servidor se pinta en el campo donde aparece', async () => {
    await abrir();
    await responderVistaPreviaInicial();
    await escribir('asunto', 'Nuevo asunto');

    boton('guardar')?.click();
    await pantalla.estable();
    pantalla.http
      .expectOne({ method: 'PUT', url: URL_SUSCRIPCION })
      .flush(
        { codigo: 'VARIABLE_NO_PERMITIDA', mensaje: 'Variable no permitida: tenant', variables: ['tenant'] },
        { status: 400, statusText: 'Bad Request' },
      );
    await pantalla.estable();

    expect(errorDe('cuerpo')).toBe('Variable no permitida: tenant');
    expect(errorDe('asunto')).toBeNull();
    await esperarDebounce();
    pedidosDeVistaPrevia().forEach((pedido) => pedido.flush(VISTA_PREVIA));
  });

  it('el 409 VERSION_OBSOLETA avisa; «Seguir editando» deja el texto en el editor', async () => {
    await abrir();
    await responderVistaPreviaInicial();
    avisos.confirmar.mockResolvedValueOnce(false);
    await escribir('cuerpo', '<p>Mi texto {{tenant}}</p>');

    boton('guardar')?.click();
    await pantalla.estable();
    pantalla.http.expectOne({ method: 'PUT', url: URL_SUSCRIPCION }).flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'Cambió' }, { status: 409, statusText: 'Conflict' });
    await pantalla.estable();

    expect(avisos.confirmar).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: MENSAJES_EDITOR_PLANTILLA.conflictoTitulo, textoConfirmar: MENSAJES_EDITOR_PLANTILLA.conflictoRecargar }),
    );
    expect(campo('cuerpo').value).toBe('<p>Mi texto {{tenant}}</p>');
    pantalla.http.expectNone({ method: 'GET', url: URL_SUSCRIPCION });
    await esperarDebounce();
    pedidosDeVistaPrevia().forEach((pedido) => pedido.flush(VISTA_PREVIA));
  });

  it('sin gestionar: campos de solo lectura, sin chips ni «Guardar»', async () => {
    await abrir([PERMISOS_PLANTILLAS.consultar]);
    await responderVistaPreviaInicial();

    expect(campo('asunto').readOnly).toBe(true);
    expect(campo('cuerpo').readOnly).toBe(true);
    expect(boton('guardar')).toBeNull();
    expect(elemento().querySelector('[data-variable]')).toBeNull();
    expect(elemento().querySelector('[data-aviso="solo-lectura"]')).not.toBeNull();
  });

  it('una plantilla que no existe o no es personalizable muestra el estado vacío', async () => {
    avisos = crearDobleAvisos();
    pantalla = await abrirAdmin('/admin/plantillas/INTEGRIDAD_ROTA/CORREO', new DobleSesion().conPermisos(...GESTIONAR), avisos);
    pantalla.http
      .expectOne(`${URL_SUSCRIPCION.replace('SUSCRIPCION_POR_VENCER', 'INTEGRIDAD_ROTA')}`)
      .flush({ codigo: 'PLANTILLA_NO_ENCONTRADA', mensaje: 'No existe' }, { status: 404, statusText: 'Not Found' });
    await pantalla.estable();

    expect(elemento().querySelector('vit-estado-vacio')?.textContent).toContain(MENSAJES_EDITOR_PLANTILLA.noExiste);
  });
});
