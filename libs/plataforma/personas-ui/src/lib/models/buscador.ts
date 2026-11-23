import type { AvisoIdentidad, PersonaListada } from './busqueda';
import type { Denominacion, PersonaResumen, TipoDocumento } from './persona';

/** `seleccion`: sugiere y emite la persona elegida. `lista`: solo emite el texto para que la página filtre. */
export type ModoBuscador = 'seleccion' | 'lista';

/** Lo que el buscador entrega al elegir una sugerencia o «Usar» una persona encontrada. */
export interface PersonaElegida {
  id: string;
  denominacion: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
}

/** Lo que hace falta para abrir el alta: el documento buscado y, si TR-IDN respondió, el prellenado. */
export interface PedidoAlta {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  prellenado: Denominacion | null;
  aviso: AvisoIdentidad | null;
}

/** Lo que se ve debajo del campo después de la espera de 300 ms. */
export type ResultadoBuscador =
  | { tipo: 'nada' }
  | { tipo: 'buscando' }
  | { tipo: 'sugerencias'; personas: PersonaListada[]; total: number }
  | { tipo: 'sin-resultados' }
  | { tipo: 'encontrada'; persona: PersonaResumen }
  | { tipo: 'nueva'; pedido: PedidoAlta }
  | { tipo: 'error'; mensaje: string };
