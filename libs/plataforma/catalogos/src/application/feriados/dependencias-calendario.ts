import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { ParametrosCalendario } from '../ports/calendario.port.js';
import type { LecturaCalendario } from '../ports/feriados.js';

export interface DependenciasCalendario {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  lectura: LecturaCalendario;
  parametros: ParametrosCalendario;
}

/** La sucursal pedida o, si no, la del contexto (X-Sucursal-Id). La misma resuelve `sabado_habil` (TR-RN-014). */
export function sucursalDelCalculo(contexto: TenantContext, sucursalId: string | undefined): string | null {
  return sucursalId ?? contexto.current().branchId ?? null;
}
