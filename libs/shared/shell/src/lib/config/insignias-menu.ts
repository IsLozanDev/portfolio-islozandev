import { InjectionToken, signal, type Signal } from '@angular/core';

/** Código de opción del menú (`seg.opcion.codigo`) → número que se muestra junto a ella. */
export type InsigniasMenu = Readonly<Record<string, number>>;

/**
 * Números junto a las opciones del menú (spec 18: solicitudes de soporte pendientes). Lo provee la app,
 * no una ruta: el layout es padre de las rutas y no ve sus proveedores. Sin proveedor, no hay insignias.
 */
export const INSIGNIAS_MENU = new InjectionToken<Signal<InsigniasMenu>>('INSIGNIAS_MENU', { factory: () => signal({}).asReadonly() });
