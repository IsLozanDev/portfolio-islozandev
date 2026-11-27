import { Component, computed, input, linkedSignal } from '@angular/core';

const TAMANO_LOGO_CHICO = 32;
const TAMANO_LOGO_GRANDE = 96;
export type TamanoLogo = typeof TAMANO_LOGO_CHICO | typeof TAMANO_LOGO_GRANDE;

/**
 * Miniatura cuadrada del logo de una empresa (spec 17d): `object-fit: contain`, porque los logos vienen en
 * proporciones distintas. Sin URL, o si la imagen no carga, muestra la inicial de la razón social: la falta de
 * logo no se ve como un error.
 */
@Component({
  selector: 'vit-logo-empresa',
  templateUrl: './logo-empresa.component.html',
  host: { class: 'inline-flex shrink-0' },
})
export class LogoEmpresaComponent {
  readonly url = input<string | null>(null);
  readonly nombre = input.required<string>();
  readonly tamano = input<TamanoLogo>(TAMANO_LOGO_CHICO);

  /** Vuelve a intentar cuando llega otra URL (un logo recién subido o una firma renovada). */
  protected readonly fallo = linkedSignal({ source: this.url, computation: () => false });
  protected readonly inicial = computed(() => this.nombre().trim().charAt(0).toLocaleUpperCase('es-PE'));
  protected readonly grande = computed(() => this.tamano() === TAMANO_LOGO_GRANDE);
}
