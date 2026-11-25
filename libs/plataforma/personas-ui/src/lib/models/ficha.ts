import type { PersonaDetalle } from './persona';

/**
 * Lo que una sección de la ficha le avisa a la página. `actualizada`: la persona con su versión nueva, sin releer.
 * `recargar`: hay que leerla otra vez (tras un borrado, que responde 204, o si otro la cambió), con un aviso opcional.
 */
export type CambioFicha = { tipo: 'actualizada'; persona: PersonaDetalle } | { tipo: 'recargar'; aviso: string | null };

/** Lo que devuelve un panel de edición de la ficha. Sin resultado: se canceló. */
export type ResultadoPanelFicha = { tipo: 'guardada'; persona: PersonaDetalle } | { tipo: 'obsoleta' } | { tipo: 'recargar'; aviso: string | null };

/**
 * Hay que releer: la versión enviada ya no es la vigente, la persona cambió en medio o se fusionó en otra
 * (al releer, la API devuelve la conservada con `resueltaDesde`).
 */
export const CODIGOS_PERSONA_CAMBIADA: readonly string[] = ['VERSION_OBSOLETA', 'conflict', 'PERSONA_FUSIONADA'];

export const TAMANO_LISTA_FICHA = 50;
