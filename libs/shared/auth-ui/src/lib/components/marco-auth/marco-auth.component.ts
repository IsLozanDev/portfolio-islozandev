import { Component, input } from '@angular/core';

export const RUTA_ILUSTRACION_VITRINA = 'assets/auth-ui/vitrina.svg';

export const MENSAJES_MARCO_AUTH = {
  marca: 'Vitrina',
  lema: 'Administración de su negocio',
  invitacionDe: 'Invitación de',
} as const;

/** Marco de las páginas `/auth`: panel decorativo de la vitrina y el contenido de la página. */
@Component({
  selector: 'vit-marco-auth',
  templateUrl: './marco-auth.component.html',
})
export class MarcoAuthComponent {
  /** Nombre que se resalta en el panel; solo lo usa la invitación. */
  readonly destacado = input<string | null | undefined>();

  protected readonly rutaIlustracion = RUTA_ILUSTRACION_VITRINA;
  protected readonly mensajes = MENSAJES_MARCO_AUTH;
}
