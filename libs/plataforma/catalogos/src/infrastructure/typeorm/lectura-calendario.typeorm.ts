import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { LecturaCalendario } from '../../application/ports/feriados.js';

// SQL crudo (regla 11): cat.fechas_feriado proyecta los recurrentes al rango en una sola consulta.
// ::text: node-pg convierte date en Date con la zona del proceso.
const FECHAS_FERIADO = 'SELECT fecha::text AS fecha FROM cat.fechas_feriado($1, $2, $3) AS fecha';

export class LecturaCalendarioTypeOrm implements LecturaCalendario {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async fechasFeriado(desde: string, hasta: string, sucursalId: string | null): Promise<string[]> {
    const filas: { fecha: string }[] = await this.unidadDeTrabajo.manager.query(FECHAS_FERIADO, [desde, hasta, sucursalId]);
    return filas.map((fila) => fila.fecha);
  }
}
