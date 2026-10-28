import { TestBed } from '@angular/core/testing';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { prepararSweetAlertEnJsdom } from '../../testing/sweetalert-en-jsdom';
import { AvisosService, DURACION_TOAST_MS } from './avisos.service';

function popup(): HTMLElement {
  const elemento = Swal.getPopup();
  if (!elemento) throw new Error('No hay popup abierto');
  return elemento;
}

function textoDe(selector: string): string {
  return popup().querySelector(selector)?.textContent ?? '';
}

async function esperarPopup(): Promise<HTMLElement> {
  await vi.waitFor(() => expect(Swal.getPopup()).not.toBeNull());
  return popup();
}

async function esperarCierre(): Promise<void> {
  await vi.waitFor(() => expect(document.querySelector('.swal2-container')).toBeNull());
}

function escribirMotivo(valor: string): void {
  const campo = popup().querySelector('textarea');
  if (!campo) throw new Error('No hay campo de motivo');
  campo.value = valor;
  campo.dispatchEvent(new Event('input'));
}

prepararSweetAlertEnJsdom();

describe('AvisosService', () => {
  let avisos: AvisosService;

  beforeEach(() => {
    avisos = TestBed.inject(AvisosService);
  });

  afterEach(async () => {
    vi.useRealTimers();
    Swal.close();
    await esperarCierre();
  });

  it.each([
    ['info', 'swal2-info'],
    ['exito', 'swal2-success'],
    ['advertencia', 'swal2-warning'],
    ['error', 'swal2-error'],
  ] as const)('%s abre un modal con su icono, título y texto', async (tipo, claseIcono) => {
    const cerrado = avisos[tipo]('Título', 'Detalle');
    await esperarPopup();

    expect(popup().querySelector(`.swal2-icon.${claseIcono}`)).not.toBeNull();
    expect(textoDe('.swal2-title')).toBe('Título');
    expect(textoDe('.swal2-html-container')).toBe('Detalle');
    expect(popup().classList).toContain('vit-aviso');

    Swal.clickConfirm();
    await expect(cerrado).resolves.toBeUndefined();
  });

  it('muestra el HTML del título y del texto como texto literal', async () => {
    void avisos.info('<b>x</b>', '<i>y</i>');
    await esperarPopup();

    expect(popup().querySelector('b, i')).toBeNull();
    expect(textoDe('.swal2-title')).toBe('<b>x</b>');
    expect(textoDe('.swal2-html-container')).toBe('<i>y</i>');
  });

  describe('confirmar', () => {
    it('devuelve true al pulsar «Aceptar»', async () => {
      const respuesta = avisos.confirmar({ titulo: '¿Continuar?' });
      await esperarPopup();
      expect(Swal.getConfirmButton()?.textContent).toBe('Aceptar');
      Swal.clickConfirm();
      await expect(respuesta).resolves.toBe(true);
    });

    it('devuelve false al pulsar «Cancelar»', async () => {
      const respuesta = avisos.confirmar({ titulo: '¿Continuar?' });
      await esperarPopup();
      expect(Swal.getCancelButton()?.textContent).toBe('Cancelar');
      Swal.clickCancel();
      await expect(respuesta).resolves.toBe(false);
    });

    it('devuelve false con Esc', async () => {
      const respuesta = avisos.confirmar({ titulo: '¿Continuar?' });
      await esperarPopup();
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await expect(respuesta).resolves.toBe(false);
    });
  });

  describe('confirmarDestructiva (TR-RNF-021)', () => {
    it('marca el popup como destructivo, usa «Eliminar» y deja el foco en «Cancelar»', async () => {
      void avisos.confirmarDestructiva({ titulo: '¿Eliminar el rol?' });
      await esperarPopup();

      expect(popup().classList).toContain('vit-aviso-destructivo');
      expect(Swal.getConfirmButton()?.textContent).toBe('Eliminar');
      await vi.waitFor(() => expect(document.activeElement).toBe(Swal.getCancelButton()));
    });

    it('sin motivo devuelve motivo null', async () => {
      const respuesta = avisos.confirmarDestructiva({ titulo: '¿Eliminar?' });
      await esperarPopup();
      Swal.clickConfirm();
      await expect(respuesta).resolves.toEqual({ confirmado: true, motivo: null });
    });

    it('cancelar devuelve confirmado false', async () => {
      const respuesta = avisos.confirmarDestructiva({ titulo: '¿Eliminar?', pedirMotivo: true });
      await esperarPopup();
      Swal.clickCancel();
      await expect(respuesta).resolves.toEqual({ confirmado: false });
    });

    it('con un motivo de 9 caracteres no cierra y muestra el error', async () => {
      void avisos.confirmarDestructiva({ titulo: '¿Eliminar?', pedirMotivo: true });
      await esperarPopup();

      escribirMotivo('  123456789  ');
      Swal.clickConfirm();

      await vi.waitFor(() => expect(Swal.getValidationMessage()?.textContent).toBe('Ingrese un motivo de al menos 10 caracteres.'));
      expect(Swal.getPopup()).not.toBeNull();
    });

    it('con un motivo válido devuelve el motivo recortado', async () => {
      const respuesta = avisos.confirmarDestructiva({ titulo: '¿Eliminar?', pedirMotivo: true });
      await esperarPopup();

      escribirMotivo('  motivo válido  ');
      Swal.clickConfirm();

      await expect(respuesta).resolves.toEqual({ confirmado: true, motivo: 'motivo válido' });
    });

    it('con longitudMinimaMotivo 4 rechaza «Ces» y muestra el error con esa longitud', async () => {
      void avisos.confirmarDestructiva({ titulo: '¿Finalizar?', pedirMotivo: true, longitudMinimaMotivo: 4 });
      await esperarPopup();

      escribirMotivo('Ces');
      Swal.clickConfirm();

      await vi.waitFor(() => expect(Swal.getValidationMessage()?.textContent).toBe('Ingrese un motivo de al menos 4 caracteres.'));
      expect(Swal.getPopup()).not.toBeNull();
    });

    it('con longitudMinimaMotivo 4 acepta «Cese»', async () => {
      const respuesta = avisos.confirmarDestructiva({ titulo: '¿Finalizar?', pedirMotivo: true, longitudMinimaMotivo: 4 });
      await esperarPopup();

      escribirMotivo('Cese');
      Swal.clickConfirm();

      await expect(respuesta).resolves.toEqual({ confirmado: true, motivo: 'Cese' });
    });
  });

  describe('toast', () => {
    it('no bloquea la página y se cierra a los 3 s', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      avisos.toast('exito', 'Guardado');
      await esperarPopup();

      expect(popup().classList).toContain('swal2-toast');
      expect(document.body.classList).toContain('swal2-toast-shown');
      expect(popup().getAttribute('aria-modal')).toBeNull();
      expect(textoDe('.swal2-title')).toBe('Guardado');

      await vi.advanceTimersByTimeAsync(DURACION_TOAST_MS + 500);
      await esperarCierre();
    });

    it('espera a que se cierre el modal abierto', async () => {
      void avisos.error('Error del servidor');
      await esperarPopup();

      avisos.toast('info', 'Después');
      await Promise.resolve();
      expect(textoDe('.swal2-title')).toBe('Error del servidor');

      Swal.clickConfirm();
      await vi.waitFor(() => expect(Swal.getPopup()?.classList).toContain('swal2-toast'));
      expect(textoDe('.swal2-title')).toBe('Después');
    });
  });
});
