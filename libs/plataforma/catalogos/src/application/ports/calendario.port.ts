export const CALENDARIO_PORT = Symbol('CalendarioPort');

/**
 * TR-RF-029. Única vía de los productos para calcular días hábiles (TR-RNF-119). El tenant sale del
 * TenantContext y no se evalúa permiso. Sin sucursal: la del contexto, si la hay; si no, solo los feriados
 * globales y del tenant. Una sucursal de otro tenant calcula solo con los globales y los del tenant (RLS).
 * FeriadoInvalidoError si la fecha no es válida o `dias` está fuera de 0 a 366.
 */
export interface CalendarioPort {
  /** No cuenta `fecha`. Con `dias = 0`, `fecha` si es hábil o el siguiente hábil. */
  sumarDiasHabiles(fecha: string, dias: number, sucursalId?: string): Promise<string>;
  esDiaHabil(fecha: string, sucursalId?: string): Promise<boolean>;
}

export const PARAMETROS_CALENDARIO = Symbol('ParametrosCalendario');

/**
 * `plat.calendario.sabado_habil` resuelto por sucursal, empresa, tenant y defecto (TR-RN-014). Lo implementa
 * apps/api con ParametroPort: catalogos no depende de parametros (TR-RNF-119).
 */
export interface ParametrosCalendario {
  sabadoHabil(sucursalId: string | null): Promise<boolean>;
}
