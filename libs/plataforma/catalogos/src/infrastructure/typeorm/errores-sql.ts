import { QueryFailedError } from 'typeorm';

const VIOLACION_UNICIDAD = '23505';
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esViolacionDeUnicidad(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  return (error.driverError as { code?: string }).code === VIOLACION_UNICIDAD;
}

/** Un id que no es UUID no llega a la base: daría 22P02 en vez de «no existe». */
export function esUuid(valor: string): boolean {
  return FORMATO_UUID.test(valor);
}
