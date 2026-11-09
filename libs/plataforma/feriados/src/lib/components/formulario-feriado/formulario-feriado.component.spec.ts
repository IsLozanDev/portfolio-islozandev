import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { MatDialogRef } from '@angular/material/dialog';
import { PanelLateralService } from '@vitrina/shared/ui';
import { aniversario, CUSCO, intiRaymi, SUCURSALES } from '../../../testing/feriados-de-prueba';
import { estable, prepararHttpDePrueba, URL_FERIADOS } from '../../../testing/http-de-prueba';
import { aFeriadoDelAnio, type AlcanceFeriado, type FeriadoDelAnioRespuesta } from '../../models/feriado';
import { MENSAJES_FORMULARIO_FERIADO } from '../../models/mensajes-feriados';
import { FormularioFeriadoComponent, type DatosFormularioFeriado, type ResultadoFormularioFeriado } from './formulario-feriado.component';

const ERROR_DUPLICADO = { codigo: 'FERIADO_DUPLICADO', mensaje: 'La fecha ya está registrada como feriado' };

describe('FormularioFeriadoComponent', () => {
  let http: HttpTestingController;
  let referencia: MatDialogRef<FormularioFeriadoComponent, ResultadoFormularioFeriado>;
  let resultado: ResultadoFormularioFeriado | undefined | null;

  const panel = (): HTMLElement => {
    const encontrado = document.querySelector<HTMLElement>('vit-formulario-feriado');
    if (!encontrado) throw new Error('El panel no está abierto');
    return encontrado;
  };
  const campo = <T extends HTMLElement>(nombre: string) => panel().querySelector<T>(`[data-campo="${nombre}"]`);

  async function abrir(alcances: AlcanceFeriado[], feriado: FeriadoDelAnioRespuesta | null = null): Promise<void> {
    http = prepararHttpDePrueba();
    const datos: DatosFormularioFeriado = { alcances, sucursales: SUCURSALES, feriado: feriado && aFeriadoDelAnio(feriado) };
    referencia = TestBed.inject(PanelLateralService).abrir(FormularioFeriadoComponent, { datos });
    resultado = null;
    referencia.afterClosed().subscribe((valor) => (resultado = valor));
    await estable();
  }

  function escribir(nombre: string, valor: string): void {
    const entrada = campo<HTMLInputElement>(nombre);
    if (!entrada) throw new Error(`No está el campo ${nombre}`);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
    entrada.dispatchEvent(new Event('blur'));
  }

  async function enviar(): Promise<void> {
    panel().querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await estable();
  }

  afterEach(async () => {
    referencia.close();
    await estable();
    http.verify();
  });

  it('en admin, SUCURSAL exige la sucursal y no envía nada', async () => {
    await abrir(['TENANT', 'SUCURSAL']);
    panel().querySelector<HTMLButtonElement>('[data-alcance="SUCURSAL"] button')?.click();
    escribir('fecha', '24/06/2026');
    escribir('nombre', 'Inti Raymi');
    await enviar();

    expect(panel().querySelector('[data-error="sucursal"]')?.textContent).toContain('obligatorio');
    http.expectNone(URL_FERIADOS);
  });

  it('en admin crea un feriado de la empresa con alcance TENANT y sin sucursal', async () => {
    await abrir(['TENANT', 'SUCURSAL']);
    escribir('fecha', '15/05/2027');
    escribir('nombre', 'Aniversario');
    await enviar();

    const pedido = http.expectOne({ method: 'POST', url: URL_FERIADOS });
    expect(pedido.request.body).toEqual({ alcance: 'TENANT', sucursal_id: null, fecha: '2027-05-15', nombre: 'Aniversario', recurrente_anual: false });
    pedido.flush({});
    await estable();
    expect(resultado).toBe('creado');
  });

  it('TR-CA-077: FERIADO_DUPLICADO va al campo fecha y el panel sigue abierto', async () => {
    await abrir(['TENANT', 'SUCURSAL']);
    escribir('fecha', '08/10/2026');
    escribir('nombre', 'Combate de Angamos');
    await enviar();
    http.expectOne({ method: 'POST', url: URL_FERIADOS }).flush(ERROR_DUPLICADO, { status: 409, statusText: 'Conflict' });
    await estable();

    expect(panel().querySelector('[data-error="fecha"]')?.textContent?.trim()).toBe('La fecha ya está registrada como feriado');
    expect(resultado).toBeNull();
  });

  it('en la consola no pregunta el alcance y crea GLOBAL', async () => {
    await abrir(['GLOBAL']);
    expect(campo('alcance')).toBeNull();
    expect(panel().querySelector('[data-nota="global"]')?.textContent).toContain(MENSAJES_FORMULARIO_FERIADO.notaGlobal);
    escribir('fecha', '13/04/2028');
    escribir('nombre', 'Jueves Santo');
    await enviar();

    const pedido = http.expectOne({ method: 'POST', url: URL_FERIADOS });
    expect(pedido.request.body).toMatchObject({ alcance: 'GLOBAL', sucursal_id: null });
    pedido.flush({});
    await estable();
  });

  it('al editar, el alcance y la sucursal van en solo lectura y el PUT lleva la versión', async () => {
    await abrir(['TENANT', 'SUCURSAL'], intiRaymi);
    expect(campo('alcance')).toBeNull();
    expect(campo('sucursal')).toBeNull();
    expect(panel().querySelector('[data-solo-lectura="alcance"]')?.textContent).toContain('Cusco');
    escribir('nombre', 'Inti Raymi en Cusco');
    await enviar();

    const pedido = http.expectOne({ method: 'PUT', url: `${URL_FERIADOS}/${intiRaymi.id}` });
    expect(pedido.request.body).toEqual({ fecha: '2026-06-24', nombre: 'Inti Raymi en Cusco', recurrente_anual: true, version: 2 });
    pedido.flush({ cambiado: true });
    await estable();
    expect(resultado).toBe('actualizado');
  });

  it('VERSION_OBSOLETA va como alerta en el panel', async () => {
    await abrir(['TENANT', 'SUCURSAL'], aniversario);
    await enviar();
    http
      .expectOne({ method: 'PUT', url: `${URL_FERIADOS}/${aniversario.id}` })
      .flush({ codigo: 'VERSION_OBSOLETA', mensaje: 'Otro usuario modificó el registro; recargue' }, { status: 409, statusText: 'Conflict' });
    await estable();
    expect(panel().querySelector('[data-error="panel"]')?.textContent?.trim()).toBe('Otro usuario modificó el registro; recargue');
  });

  it('un doble clic en «Guardar» envía una sola petición', async () => {
    await abrir(['TENANT', 'SUCURSAL']);
    panel().querySelector<HTMLButtonElement>('[data-alcance="SUCURSAL"] button')?.click();
    await estable();
    const select = campo('sucursal');
    select?.click();
    await estable();
    document.querySelector<HTMLElement>(`mat-option:nth-of-type(1)`)?.click();
    escribir('fecha', '24/06/2026');
    escribir('nombre', 'Inti Raymi');
    const guardar = panel().querySelector<HTMLButtonElement>('button[type="submit"]');
    guardar?.click();
    guardar?.click();
    await estable();

    const pedido = http.expectOne({ method: 'POST', url: URL_FERIADOS });
    expect(pedido.request.body).toMatchObject({ alcance: 'SUCURSAL', sucursal_id: CUSCO });
    pedido.flush({});
    await estable();
  });
});
