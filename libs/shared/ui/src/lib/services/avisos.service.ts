import { Injectable } from '@angular/core';
import type { SweetAlertCustomClass, SweetAlertIcon, SweetAlertOptions, SweetAlertResult } from 'sweetalert2';
// Build sin CSS inyectado: los estilos llegan por `styles` de la app (sweetalert2.css + estilos/sweetalert.css).
import Swal from 'sweetalert2/dist/sweetalert2.js';
import type {
  OpcionesConfirmacion,
  OpcionesConfirmacionDestructiva,
  ResultadoConfirmacionDestructiva,
  TipoAviso,
} from '../models/aviso';
import { MENSAJES_UI } from '../models/mensajes-ui';

export const LONGITUD_MINIMA_MOTIVO = 10;
export const DURACION_TOAST_MS = 3000;

const ICONO_POR_TIPO: Readonly<Record<TipoAviso, SweetAlertIcon>> = {
  info: 'info',
  exito: 'success',
  advertencia: 'warning',
  error: 'error',
};

const CLASES_AVISO: SweetAlertCustomClass = { popup: 'vit-aviso' };
const CLASES_AVISO_DESTRUCTIVO: SweetAlertCustomClass = { popup: ['vit-aviso', 'vit-aviso-destructivo'] };

const CAMPO_MOTIVO: SweetAlertOptions = {
  input: 'textarea',
  inputLabel: MENSAJES_UI.motivo,
  inputValidator: (valor: string) => (valor.trim().length < LONGITUD_MINIMA_MOTIVO ? MENSAJES_UI.motivoMuyCorto : null),
};

/**
 * Único punto del front que usa SweetAlert2. Los textos van como texto plano
 * (`titleText`, `text`): `title` y `html` de SweetAlert2 interpretan HTML.
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  /** SweetAlert2 muestra un popup a la vez: el toast espera a que se cierre el modal abierto. */
  private modalEnCurso: Promise<unknown> = Promise.resolve();

  info(titulo: string, texto?: string): Promise<void> {
    return this.mostrar('info', titulo, texto);
  }

  exito(titulo: string, texto?: string): Promise<void> {
    return this.mostrar('exito', titulo, texto);
  }

  advertencia(titulo: string, texto?: string): Promise<void> {
    return this.mostrar('advertencia', titulo, texto);
  }

  error(titulo: string, texto?: string): Promise<void> {
    return this.mostrar('error', titulo, texto);
  }

  async confirmar(opciones: OpcionesConfirmacion): Promise<boolean> {
    const resultado = await this.abrirModal({
      icon: 'question',
      titleText: opciones.titulo,
      text: opciones.texto,
      showCancelButton: true,
      confirmButtonText: opciones.textoConfirmar ?? MENSAJES_UI.aceptar,
      cancelButtonText: opciones.textoCancelar ?? MENSAJES_UI.cancelar,
      customClass: CLASES_AVISO,
    });
    return resultado.isConfirmed;
  }

  async confirmarDestructiva(opciones: OpcionesConfirmacionDestructiva): Promise<ResultadoConfirmacionDestructiva> {
    const resultado = await this.abrirModal({
      icon: 'warning',
      titleText: opciones.titulo,
      text: opciones.texto,
      showCancelButton: true,
      focusCancel: true,
      confirmButtonText: opciones.textoConfirmar ?? MENSAJES_UI.eliminar,
      cancelButtonText: opciones.textoCancelar ?? MENSAJES_UI.cancelar,
      customClass: CLASES_AVISO_DESTRUCTIVO,
      ...(opciones.pedirMotivo ? CAMPO_MOTIVO : {}),
    });
    if (!resultado.isConfirmed) return { confirmado: false };
    return { confirmado: true, motivo: opciones.pedirMotivo ? String(resultado.value).trim() : null };
  }

  toast(tipo: TipoAviso, texto: string): void {
    void this.modalEnCurso.then(() =>
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: ICONO_POR_TIPO[tipo],
        titleText: texto,
        showConfirmButton: false,
        timer: DURACION_TOAST_MS,
        timerProgressBar: true,
        customClass: CLASES_AVISO,
        didOpen: (popup) => {
          popup.addEventListener('mouseenter', () => Swal.stopTimer());
          popup.addEventListener('mouseleave', () => Swal.resumeTimer());
        },
      }),
    );
  }

  private async mostrar(tipo: TipoAviso, titulo: string, texto?: string): Promise<void> {
    await this.abrirModal({
      icon: ICONO_POR_TIPO[tipo],
      titleText: titulo,
      text: texto,
      confirmButtonText: MENSAJES_UI.aceptar,
      customClass: CLASES_AVISO,
    });
  }

  private abrirModal(opciones: SweetAlertOptions): Promise<SweetAlertResult> {
    // `Swal.fire` devuelve un thenable sin `catch`.
    const modal = Promise.resolve(Swal.fire(opciones));
    this.modalEnCurso = modal.catch(() => undefined);
    return modal;
  }
}
