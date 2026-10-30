/** Repetida de `libs/plataforma/org` (type:backend, no importable) hasta el catálogo TIPO_UNIDAD (spec 19a). */
export const TIPOS_UNIDAD = [
  'ALMACEN',
  'CAJA',
  'PUNTO_VENTA',
  'CONSULTORIO',
  'VENTANILLA',
  'SALON',
  'ESTACION_PRODUCCION',
  'FARMACIA',
  'OFICINA',
] as const;
export type TipoUnidad = (typeof TIPOS_UNIDAD)[number];

/** El único tipo que puede registrarse sin sucursal (TR-RN-004). */
export const TIPO_ALMACEN: TipoUnidad = 'ALMACEN';

export const ETIQUETAS_TIPO_UNIDAD: Readonly<Record<TipoUnidad, string>> = {
  ALMACEN: 'Almacén',
  CAJA: 'Caja',
  PUNTO_VENTA: 'Punto de venta',
  CONSULTORIO: 'Consultorio',
  VENTANILLA: 'Ventanilla',
  SALON: 'Salón',
  ESTACION_PRODUCCION: 'Estación de producción',
  FARMACIA: 'Farmacia',
  OFICINA: 'Oficina',
};
