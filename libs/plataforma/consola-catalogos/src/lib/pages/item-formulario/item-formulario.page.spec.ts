import type { TestRequest } from '@angular/common/http/testing';
import { DobleSesion } from '../../../testing/doble-sesion';
import { API_URL } from '../../../testing/http-de-prueba';
import { abrirConsola, crearDobleAvisos, Destino, type ConsolaDePrueba, type DobleAvisos } from '../../../testing/rutas-de-prueba';
import { MENSAJES_FORMULARIO_ITEM_CONSOLA } from '../../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../../models/permisos-catalogos';

const URL_ITEMS = `${API_URL}/catalogos/DOC_PRUEBA/items-globales`;
const ITEM_ID = '0193f3a0-0000-7000-8000-00000000d009';
/** 2026-11-08 en Lima. */
const AHORA = new Date('2026-11-08T15:00:00Z');
/** El detalle como destino vacío: así no pide nada al volver. */
const DETALLE_VACIO = [{ path: 'DOC_PRUEBA', component: Destino }];

const DNI = {
  id: ITEM_ID,
  codigo: 'DNI',
  codigo_externo: '1',
  nombre: 'DNI',
  abreviatura: null,
  orden: 1,
  atributos: { longitud: 8, decimales: 0 },
  vigente_desde: '2026-01-01',
  vigente_hasta: null,
  activo: true,
  version: 4,
};

describe('ItemFormularioPage', () => {
  let sesion: DobleSesion;
  let avisos: DobleAvisos;
  let consola: ConsolaDePrueba;

  const campo = <T extends HTMLElement = HTMLInputElement>(nombre: string) => consola.elemento().querySelector<T>(`[data-campo="${nombre}"]`);
  const errores = () => [...consola.elemento().querySelectorAll('mat-error')].map((error) => error.textContent?.trim()).filter(Boolean);

  async function escribir(nombre: string, valor: string): Promise<void> {
    const entrada = campo<HTMLInputElement | HTMLTextAreaElement>(nombre);
    if (!entrada) throw new Error(`sin campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('blur'));
    await consola.estable();
  }

  async function enviar(): Promise<void> {
    consola.elemento().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await consola.estable();
  }

  async function abrirAlta(): Promise<void> {
    consola = await abrirConsola('/consola/catalogos/DOC_PRUEBA/items/nuevo', sesion, avisos, DETALLE_VACIO);
  }

  async function abrirEdicion(item: object = DNI): Promise<void> {
    consola = await abrirConsola(`/consola/catalogos/DOC_PRUEBA/items/${ITEM_ID}/editar`, sesion, avisos, DETALLE_VACIO);
    consola.http.expectOne({ method: 'GET', url: `${URL_ITEMS}/${ITEM_ID}` }).flush(item);
    await consola.estable();
  }

  async function llenarDni(): Promise<void> {
    await escribir('codigo', 'DNI');
    await escribir('nombre', 'DNI');
    await escribir('codigoExterno', '1');
  }

  const esperarAlta = (): TestRequest => consola.http.expectOne({ method: 'POST', url: URL_ITEMS });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer, PERMISOS_CATALOGOS.itemGestionar], mfaVigente: true });
    avisos = crearDobleAvisos();
  });

  afterEach(() => {
    vi.useRealTimers();
    consola.http.verify();
  });

  it('TR-CA-060: el DNI con longitud 8 y regex envía esos atributos, la vigencia de hoy y vuelve al detalle', async () => {
    await abrirAlta();
    await llenarDni();
    await escribir('longitud', '8');
    await escribir('regex', '^\\d{8}$');
    await enviar();

    const peticion = esperarAlta();
    expect(peticion.request.body).toEqual({
      codigo: 'DNI',
      codigo_externo: '1',
      nombre: 'DNI',
      abreviatura: null,
      atributos: { longitud: 8, regex: '^\\d{8}$' },
      vigente_desde: '2026-11-08',
      vigente_hasta: null,
      activo: true,
    });
    peticion.flush(DNI);
    await consola.estable();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FORMULARIO_ITEM_CONSOLA.creado);
    expect(consola.url()).toBe('/consola/catalogos/DOC_PRUEBA?pestana=items');
  });

  it('un regex inválido no deja guardar', async () => {
    await abrirAlta();
    await llenarDni();
    await escribir('regex', '[0-9');
    await enviar();

    consola.http.expectNone(URL_ITEMS);
    expect(errores()).toContain('La expresión regular no es válida');
  });

  it('al editar carga el ítem por id, la clave desconocida va al JSON avanzado y se reenvía', async () => {
    await abrirEdicion();
    expect(campo('codigo')?.disabled).toBe(true);
    expect(campo('longitud')?.value).toBe('8');
    expect(JSON.parse(campo<HTMLTextAreaElement>('avanzado')?.value ?? '')).toEqual({ decimales: 0 });

    await escribir('nombre', 'Documento nacional de identidad');
    await enviar();
    const peticion = consola.http.expectOne({ method: 'PUT', url: `${URL_ITEMS}/${ITEM_ID}` });
    expect(peticion.request.body).toMatchObject({ nombre: 'Documento nacional de identidad', atributos: { longitud: 8, decimales: 0 }, version: 4 });
    expect(peticion.request.body).not.toHaveProperty('codigo');
    peticion.flush({ ...DNI, version: 5, cambiado: true });
    await consola.estable();
    expect(avisos.toast).toHaveBeenCalledWith('exito', MENSAJES_FORMULARIO_ITEM_CONSOLA.actualizado);
  });

  it('una clave conocida en el JSON avanzado se rechaza', async () => {
    await abrirAlta();
    await llenarDni();
    await escribir('avanzado', '{"regex": "x"}');
    await enviar();

    consola.http.expectNone(URL_ITEMS);
    expect(errores()).toContain('Use el campo de arriba para regex');
  });

  it('un JSON avanzado que no es objeto se rechaza', async () => {
    await abrirAlta();
    await llenarDni();
    await escribir('avanzado', '[1, 2]');
    await enviar();

    consola.http.expectNone(URL_ITEMS);
    expect(errores().some((mensaje) => mensaje?.startsWith('Debe ser un objeto JSON'))).toBe(true);
  });

  it('más de 4 KB de atributos no deja guardar', async () => {
    await abrirAlta();
    await llenarDni();
    await escribir('avanzado', JSON.stringify({ texto: 'x'.repeat(4100) }));
    await enviar();

    consola.http.expectNone(URL_ITEMS);
    expect(consola.elemento().querySelector('[data-error="atributos"]')?.textContent).toContain('Los atributos superan 4 KB');
  });

  it('vigente_hasta anterior a vigente_desde no deja guardar', async () => {
    await abrirAlta();
    await llenarDni();
    await escribir('vigenteHasta', '01/01/2026');
    await enviar();

    consola.http.expectNone(URL_ITEMS);
    expect(errores()).toContain('La vigencia final no puede ser anterior a la inicial');
  });

  it('TR-CA-062: vigente_desde 01/01/2027 muestra la nota y la envía como 2027-01-01', async () => {
    await abrirAlta();
    expect(consola.elemento().querySelector('[data-nota="vigencia-futura"]')).toBeNull();
    await llenarDni();
    await escribir('vigenteDesde', '01/01/2027');

    expect(consola.elemento().querySelector('[data-nota="vigencia-futura"]')?.textContent).toContain('No aparecerá en las consultas hasta el 01/01/2027');
    await enviar();
    const peticion = esperarAlta();
    expect(peticion.request.body).toMatchObject({ vigente_desde: '2027-01-01' });
    peticion.flush(DNI);
    await consola.estable();
  });

  it('CODIGO_DUPLICADO va al campo codigo', async () => {
    await abrirAlta();
    await llenarDni();
    await enviar();
    esperarAlta().flush({ codigo: 'CODIGO_DUPLICADO', mensaje: 'El código ya existe en el catálogo' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();

    expect(errores()).toContain('El código ya existe en el catálogo');
    expect(consola.elemento().querySelector('[data-error="api"]')).toBeNull();
  });

  it('ITEM_INVALIDO y TABLA_SOLO_IMPORTACION van como alerta con el mensaje del back', async () => {
    await abrirAlta();
    await llenarDni();
    await enviar();
    esperarAlta().flush({ codigo: 'TABLA_SOLO_IMPORTACION', mensaje: 'Esta tabla se actualiza solo por importación' }, { status: 409, statusText: 'Conflict' });
    await consola.estable();

    expect(consola.elemento().querySelector('[data-error="api"]')?.textContent).toContain('Esta tabla se actualiza solo por importación');
  });

  it('un doble clic en «Guardar» envía una sola petición (TR-RNF-008)', async () => {
    await abrirAlta();
    await llenarDni();
    const boton = consola.elemento().querySelector<HTMLButtonElement>('button[type="submit"]');
    boton?.click();
    boton?.click();
    await consola.estable();

    esperarAlta().flush(DNI);
    await consola.estable();
  });

  it('un id que no existe muestra «El ítem no existe»', async () => {
    consola = await abrirConsola(`/consola/catalogos/DOC_PRUEBA/items/${ITEM_ID}/editar`, sesion, avisos, DETALLE_VACIO);
    consola.http.expectOne(`${URL_ITEMS}/${ITEM_ID}`).flush({ codigo: 'ITEM_NO_ENCONTRADO', mensaje: 'El ítem no existe' }, { status: 404, statusText: 'Not Found' });
    await consola.estable();

    expect(consola.elemento().textContent).toContain(MENSAJES_FORMULARIO_ITEM_CONSOLA.noExiste);
  });

  it('sin item_gestionar la ruta lleva a /403', async () => {
    sesion.contexto.set({ permisos: [PERMISOS_CATALOGOS.leer], mfaVigente: true });
    consola = await abrirConsola('/consola/catalogos/DOC_PRUEBA/items/nuevo', sesion, avisos, DETALLE_VACIO);
    expect(consola.url()).toBe('/403');
  });
});
