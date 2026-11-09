/** Atributos libres de un ítem (JSON); las claves conocidas tienen campo propio en el formulario. */
export type AtributosItem = Readonly<Record<string, unknown>>;

export const CLAVES_CONOCIDAS = ['longitud', 'regex', 'valida_reniec', 'mascara'] as const;
export type ClaveConocida = (typeof CLAVES_CONOCIDAS)[number];

/** El mismo tope que valida el back (19a). */
export const LIMITE_ATRIBUTOS_BYTES = 4096;
