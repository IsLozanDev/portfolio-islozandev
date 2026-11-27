import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { MENSAJES_VISTA_PREVIA } from '../../models/mensajes-plantillas';

/**
 * El correo se ve en blanco también en tema oscuro, como lo recibe el destinatario (canvas «47 · Plantillas»).
 * Palabras clave de CSS, no tokens: es el documento del correo, no la interfaz.
 */
const ESTILO_DEL_CORREO =
  'html{background:white;color:black;color-scheme:light}body{margin:20px 24px;font:14px/1.5 Arial,Helvetica,sans-serif}p{margin:0 0 12px}';

/**
 * El correo renderizado dentro de un `iframe` con `sandbox` vacío: sin scripts, formularios ni navegación
 * (TR-RNF-012). El HTML ya viene saneado del servidor; se marca confiable solo aquí porque Angular no deja
 * enlazar `srcdoc` sin hacerlo (decisión del spec 47).
 */
@Component({
  selector: 'vit-vista-previa-correo',
  templateUrl: './vista-previa-correo.component.html',
  host: { class: 'flex flex-col gap-2 rounded-tarjeta bg-superficie-contenedor p-3' },
})
export class VistaPreviaCorreoComponent {
  private readonly sanitizador = inject(DomSanitizer);

  readonly asunto = input.required<string>();
  readonly cuerpoHtml = input.required<string>();
  /** El último render válido mientras el texto del editor tiene errores. */
  readonly atenuado = input<boolean>(false);

  protected readonly mensajes = MENSAJES_VISTA_PREVIA;
  protected readonly documento = computed<SafeHtml>(() =>
    this.sanitizador.bypassSecurityTrustHtml(`<!doctype html><html><head><meta charset="utf-8"><style>${ESTILO_DEL_CORREO}</style></head><body>${this.cuerpoHtml()}</body></html>`),
  );
}
