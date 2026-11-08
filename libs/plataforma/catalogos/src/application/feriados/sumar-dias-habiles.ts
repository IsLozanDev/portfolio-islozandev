import { exigirDiasHabiles, sumarDiasCalendario, sumarDiasHabiles } from '../../domain/feriados/calendario.js';
import type { CalendarioPort } from '../ports/calendario.port.js';
import { sucursalDelCalculo, type DependenciasCalendario } from './dependencias-calendario.js';

/** Días de calendario por día hábil pedido al estimar el tramo que se lee de una vez. */
const DIAS_CALENDARIO_POR_HABIL = 3;
/** Margen fijo del tramo: cubre los fines de semana y unos cuantos feriados con `dias` pequeño. */
const MARGEN_DIAS_CALENDARIO = 30;

/**
 * TR-RF-029, TR-CA-075. Lee los feriados de `fecha` a `fecha + dias × 3 + 30` en una consulta. Si el resultado
 * cae fuera del tramo (solo con decenas de feriados seguidos), lee el tramo siguiente y vuelve a calcular.
 * Sin caché: se mide (TR-RNF-002). Reutiliza la transacción activa del llamador si la hay.
 */
export class SumarDiasHabiles implements Pick<CalendarioPort, 'sumarDiasHabiles'> {
  constructor(private readonly dependencias: DependenciasCalendario) {}

  sumarDiasHabiles(fecha: string, dias: number, sucursalId?: string): Promise<string> {
    const { unidadDeTrabajo, contexto, lectura, parametros } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      exigirDiasHabiles(dias);
      const sucursal = sucursalDelCalculo(contexto, sucursalId);
      const sabadoHabil = await parametros.sabadoHabil(sucursal);
      const largoTramo = dias * DIAS_CALENDARIO_POR_HABIL + MARGEN_DIAS_CALENDARIO;
      const feriados = new Set<string>();
      let desde = fecha;
      let hasta = sumarDiasCalendario(fecha, largoTramo);

      for (;;) {
        for (const feriado of await lectura.fechasFeriado(desde, hasta, sucursal)) feriados.add(feriado);
        const resultado = sumarDiasHabiles(fecha, dias, feriados, sabadoHabil);
        if (resultado <= hasta) return resultado;
        desde = sumarDiasCalendario(hasta, 1);
        hasta = sumarDiasCalendario(hasta, largoTramo);
      }
    });
  }
}
