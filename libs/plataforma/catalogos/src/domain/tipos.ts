export const ALCANCES_CATALOGO = ['GLOBAL', 'MIXTO', 'TENANT'] as const;
export type AlcanceCatalogo = (typeof ALCANCES_CATALOGO)[number];

export type MotivoInvalido = 'INEXISTENTE' | 'INACTIVO' | 'FUERA_DE_VIGENCIA' | 'OCULTO';

/** Estado de un ítem para un tenant en una fecha, como lo devuelve `cat.items`. */
export const ESTADOS_ITEM = ['VISIBLE', 'INACTIVO', 'FUERA_DE_VIGENCIA', 'OCULTO'] as const;
export type EstadoItem = (typeof ESTADOS_ITEM)[number];

/** Los catálogos no son de sucursal: un mismo día de vigencia para todos los tenants. */
export const ZONA_CATALOGOS = 'America/Lima';
