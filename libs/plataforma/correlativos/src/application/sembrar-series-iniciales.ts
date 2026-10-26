import { Serie } from '../domain/serie.js';
import { DIGITOS_COMPROBANTE, type TipoDocumento } from '../domain/tipos.js';
import type { DependenciasSeries } from './dependencias-series.js';
import { publicarEventos } from './publicar-eventos.js';

export interface SembrarSeriesInicialesComando {
  empresaId: string;
  sucursalId: string;
  /** Usuario del tenant operador que da de alta el tenant (seg.usuario es global). */
  creadoPor: string;
}

const SERIES_INICIALES: readonly { tipo: TipoDocumento; codigo: string }[] = [
  { tipo: 'BOLETA', codigo: 'B001' },
  { tipo: 'FACTURA', codigo: 'F001' },
];

/**
 * Series de la sucursal principal en el alta de tenant (spec 12). Sin AlcanceActor: quien da de alta
 * no es miembro del tenant nuevo. Solo lo llama el orquestador del alta, dentro de su transacción.
 */
export class SembrarSeriesIniciales {
  constructor(private readonly dependencias: Omit<DependenciasSeries, 'alcanceActor' | 'ubicaciones'>) {}

  ejecutar(comando: SembrarSeriesInicialesComando): Promise<Serie[]> {
    const { unidadDeTrabajo, contexto, ids, reloj, series, eventos } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const tenantId = contexto.current().tenantId;
      const ahora = reloj.now();
      const creadas: Serie[] = [];
      for (const { tipo, codigo } of SERIES_INICIALES) {
        const serie = Serie.crear({
          id: ids.next(),
          tenantId,
          ambito: { empresaId: comando.empresaId, sucursalId: comando.sucursalId, unidadId: null },
          tipo,
          codigo,
          digitos: DIGITOS_COMPROBANTE,
          reinicio: 'NUNCA',
          ultimoNumero: 0,
          por: comando.creadoPor,
          ahora,
        });
        await series.insertar(serie);
        await publicarEventos(eventos, serie);
        creadas.push(serie);
      }
      return creadas;
    });
  }
}
