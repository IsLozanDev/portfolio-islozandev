export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';
export type TemaEfectivo = 'claro' | 'oscuro';

export const PREFERENCIAS_TEMA: readonly PreferenciaTema[] = ['sistema', 'claro', 'oscuro'];
export const PREFERENCIA_TEMA_POR_DEFECTO: PreferenciaTema = 'sistema';

/** Por app y por dispositivo. El script anti-parpadeo de `index.html` repite esta clave. */
export const CLAVE_TEMA = 'vitrina.tema';
/** Va en `<html>` con el tema efectivo. El script anti-parpadeo de `index.html` repite este atributo. */
export const ATRIBUTO_TEMA = 'data-tema';
export const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';
