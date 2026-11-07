import { ItemInvalidoError } from './errores.js';

const ALIAS_MAXIMO = 200;

export interface DatosAjuste {
  visible: boolean;
  /** null: el orden del ítem global. */
  orden: number | null;
  /** null: el nombre del ítem global. */
  alias: string | null;
}

/** Personalización de un ítem global de un catálogo MIXTO para un tenant (TR-RF-025). */
export class AjusteItem {
  private constructor(
    readonly visible: boolean,
    readonly orden: number | null,
    readonly alias: string | null,
  ) {}

  static de(datos: DatosAjuste): AjusteItem {
    if (datos.alias !== null && (datos.alias.length === 0 || datos.alias.length > ALIAS_MAXIMO)) {
      throw new ItemInvalidoError('El alias debe tener de 1 a 200 caracteres');
    }
    return new AjusteItem(datos.visible, datos.orden, datos.alias);
  }

  /** Visible, sin orden ni alias: equivale a no tener ajuste, y la fila se borra. */
  esNeutro(): boolean {
    return this.visible && this.orden === null && this.alias === null;
  }

  igualA(otro: AjusteItem): boolean {
    return this.visible === otro.visible && this.orden === otro.orden && this.alias === otro.alias;
  }
}
