import { abrirAdmin, crearDobleAvisos, type AdminDePrueba } from '../../../testing/catalogos-de-prueba';
import { DobleSesion } from '../../../testing/doble-sesion';
import { detalleSuscripcion, paginaDe, resumenSuscripcion, resumenSuspendido, URL_PLANTILLAS, URL_SUSCRIPCION, VISTA_PREVIA } from '../../../testing/plantillas-de-prueba';
import { MENSAJES_PLANTILLAS } from '../../models/mensajes-plantillas';
import { PERMISOS_PLANTILLAS } from '../../models/permisos-plantillas';

describe('PlantillasListaPage (admin)', () => {
  let pantalla: AdminDePrueba;

  const elemento = () => pantalla.elemento();
  const filas = () =>
    [...elemento().querySelectorAll('tr.mat-mdc-row')].map((fila) => [...fila.querySelectorAll('td')].slice(0, 6).map((celda) => celda.textContent?.trim()));
  const fila = (texto: string) => [...elemento().querySelectorAll<HTMLElement>('tr.mat-mdc-row')].find((candidata) => candidata.textContent?.includes(texto));
  const accion = (texto: string, nombre: string) => fila(texto)?.querySelector<HTMLElement>(`[data-accion="${nombre}"]`) ?? null;
  const pedidosDeLista = () => pantalla.http.match((pedido) => pedido.method === 'GET' && pedido.url === URL_PLANTILLAS);

  async function abrir(ruta: string, permisos: string[], items = [resumenSuscripcion(), resumenSuspendido()]): Promise<void> {
    pantalla = await abrirAdmin(ruta, new DobleSesion().conPermisos(...permisos), crearDobleAvisos());
    pedidosDeLista().forEach((pedido) => pedido.flush(paginaDe(items)));
    await pantalla.estable();
  }

  afterEach(() => {
    pantalla.http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((contenedor) => contenedor.replaceChildren());
  });

  it('lista nombre con el código debajo, asunto, canal, origen, versión y fecha; la base sin versión', async () => {
    await abrir('/admin/plantillas', [PERMISOS_PLANTILLAS.consultar]);

    expect(filas()).toEqual([
      ['Aviso de suscripción por vencerSUSCRIPCION_POR_VENCER', 'Tu suscripción a {{producto}} vence en {{dias}} días', 'mailCorreo', 'Personalizada', '3', '24/11/26'],
      ['Aviso de cuenta suspendidaTENANT_SUSPENDIDO', 'La cuenta de {{tenant}} fue suspendida', 'mailCorreo', 'Base', '—', '20/11/26'],
    ]);
  });

  it('el texto de la URL viaja como q a la API y sin resultados se ve el estado vacío', async () => {
    pantalla = await abrirAdmin('/admin/plantillas?q=nada', new DobleSesion().conPermisos(PERMISOS_PLANTILLAS.consultar), crearDobleAvisos());
    const [pedido] = pedidosDeLista();
    expect(pedido.request.params.get('q')).toBe('nada');
    pedido.flush(paginaDe([]));
    await pantalla.estable();

    expect(elemento().querySelector('vit-estado-vacio')?.textContent).toContain(MENSAJES_PLANTILLAS.sinPlantillas);
  });

  it('sin gestionar no hay «Editar»; «Ver» sí', async () => {
    await abrir('/admin/plantillas', [PERMISOS_PLANTILLAS.consultar]);

    expect(accion('SUSCRIPCION', 'editar')).toBeNull();
    expect(accion('SUSCRIPCION', 'ver')).not.toBeNull();
  });

  it('con gestionar, «Editar» lleva al editor de la plantilla', async () => {
    await abrir('/admin/plantillas', [PERMISOS_PLANTILLAS.consultar, PERMISOS_PLANTILLAS.gestionar]);

    expect(accion('SUSCRIPCION', 'editar')?.getAttribute('href')).toBe('/admin/plantillas/SUSCRIPCION_POR_VENCER/CORREO');
  });

  it('«Ver» abre el panel con el correo vigente renderizado en un iframe con sandbox vacío, sin entrar al editor', async () => {
    await abrir('/admin/plantillas', [PERMISOS_PLANTILLAS.consultar]);
    accion('SUSCRIPCION', 'ver')?.click();
    await pantalla.estable();

    const previa = pantalla.http.expectOne({ method: 'POST', url: `${URL_SUSCRIPCION}/vista-previa` });
    expect(previa.request.body).toEqual({});
    previa.flush(VISTA_PREVIA);
    await pantalla.estable();

    const panel = document.querySelector<HTMLElement>('.vit-panel-lateral');
    expect(panel?.textContent).toContain('Aviso de suscripción por vencer');
    expect(panel?.querySelector('[data-origen]')?.textContent?.trim()).toBe('Personalizada · v3');
    expect(panel?.querySelector('[data-asunto-previa]')?.textContent).toBe(VISTA_PREVIA.asunto);
    const marco = panel?.querySelector('iframe');
    expect(marco?.getAttribute('sandbox')).toBe('');
    expect(marco?.getAttribute('srcdoc')).toContain(VISTA_PREVIA.cuerpo_html);
    expect(panel?.querySelector('[data-accion="editar"]')).toBeNull();
    expect(pantalla.url()).toBe('/admin/plantillas');
  });

  it('con gestionar, «Editar» del panel cierra el panel y abre el editor', async () => {
    await abrir('/admin/plantillas', [PERMISOS_PLANTILLAS.consultar, PERMISOS_PLANTILLAS.gestionar]);
    accion('SUSCRIPCION', 'ver')?.click();
    await pantalla.estable();
    pantalla.http.expectOne(`${URL_SUSCRIPCION}/vista-previa`).flush(VISTA_PREVIA);
    await pantalla.estable();

    document.querySelector<HTMLButtonElement>('.vit-panel-lateral [data-accion="editar"]')?.click();
    await pantalla.estable();
    pantalla.http.expectOne({ method: 'GET', url: URL_SUSCRIPCION }).flush(detalleSuscripcion());
    await pantalla.estable();

    expect(pantalla.url()).toBe('/admin/plantillas/SUSCRIPCION_POR_VENCER/CORREO');
    await new Promise((resolver) => setTimeout(resolver, 700));
    pantalla.http.match(`${URL_SUSCRIPCION}/vista-previa`).forEach((pedido) => pedido.flush(VISTA_PREVIA));
  });
});
