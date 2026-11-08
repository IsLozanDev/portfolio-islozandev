import { esDiaHabil } from '../../domain/feriados/calendario.js';
import type { CalendarioPort } from '../ports/calendario.port.js';
import { sucursalDelCalculo, type DependenciasCalendario } from './dependencias-calendario.js';

/** TR-RF-029. Reutiliza la transacción activa del llamador si la hay. */
export class EsDiaHabil implements Pick<CalendarioPort, 'esDiaHabil'> {
  constructor(private readonly dependencias: DependenciasCalendario) {}

  esDiaHabil(fecha: string, sucursalId?: string): Promise<boolean> {
    const { unidadDeTrabajo, contexto, lectura, parametros } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const sucursal = sucursalDelCalculo(contexto, sucursalId);
      const sabadoHabil = await parametros.sabadoHabil(sucursal);
      const feriados = new Set(await lectura.fechasFeriado(fecha, fecha, sucursal));
      return esDiaHabil(fecha, feriados, sabadoHabil);
    });
  }
}
