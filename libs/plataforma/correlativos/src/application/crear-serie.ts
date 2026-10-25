import { NotFoundError } from '@vitrina/plataforma/kernel';
import type { AmbitoSerie } from '../domain/ambito-serie.js';
import { AmbitoSerieInvalidoError } from '../domain/errores.js';
import { Serie } from '../domain/serie.js';
import type { Reinicio, TipoDocumento } from '../domain/tipos.js';
import { exigirAlcance, type DependenciasSeries } from './dependencias-series.js';
import { publicarEventos } from './publicar-eventos.js';

export interface CrearSerieComando {
  empresaId: string;
  sucursalId?: string | null;
  unidadId?: string | null;
  tipo: TipoDocumento;
  codigo: string;
  digitos?: number;
  reinicio: Reinicio;
  /** Último número ya emitido: 0 en una serie nueva; el real al migrar una existente. */
  ultimoNumero: number;
  /** Usuario que ejecuta (sub del token). */
  actorId: string;
}

/** TR-RF-035: registra una serie de la empresa, sucursal o unidad. También lo usa el alta de tenant (spec 12). */
export class CrearSerie {
  constructor(private readonly dependencias: DependenciasSeries) {}

  ejecutar(comando: CrearSerieComando): Promise<Serie> {
    const { unidadDeTrabajo, contexto, ids, reloj, series, eventos, alcanceActor } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const ambito = await this.resolverAmbito(comando);
      const ahora = reloj.now();
      await exigirAlcance(alcanceActor, comando.actorId, ambito, ahora);

      const serie = Serie.crear({
        id: ids.next(),
        tenantId: contexto.current().tenantId,
        ambito,
        tipo: comando.tipo,
        codigo: comando.codigo,
        digitos: comando.digitos,
        reinicio: comando.reinicio,
        ultimoNumero: comando.ultimoNumero,
        por: comando.actorId,
        ahora,
      });
      await series.insertar(serie);
      await publicarEventos(eventos, serie);
      return serie;
    });
  }

  /** Con unidad, la sucursal es la de la unidad. Una unidad o sucursal de otro tenant no se ve: 404. */
  private resolverAmbito(comando: CrearSerieComando): Promise<AmbitoSerie> {
    const sucursalEnviada = comando.sucursalId ?? null;
    if (comando.unidadId) return this.ambitoDeUnidad(comando.empresaId, sucursalEnviada, comando.unidadId);
    if (sucursalEnviada) return this.ambitoDeSucursal(comando.empresaId, sucursalEnviada);
    return Promise.resolve({ empresaId: comando.empresaId, sucursalId: null, unidadId: null });
  }

  private async ambitoDeUnidad(empresaId: string, sucursalEnviada: string | null, unidadId: string): Promise<AmbitoSerie> {
    const unidad = await this.dependencias.ubicaciones.sucursalDeUnidad(unidadId);
    if (!unidad) throw new NotFoundError('La unidad no existe');
    if (unidad.empresaId !== empresaId) throw new AmbitoSerieInvalidoError('La unidad no pertenece a la empresa');
    if (sucursalEnviada !== null && sucursalEnviada !== unidad.sucursalId) {
      throw new AmbitoSerieInvalidoError('La unidad no pertenece a la sucursal');
    }
    return { empresaId, sucursalId: unidad.sucursalId, unidadId };
  }

  private async ambitoDeSucursal(empresaId: string, sucursalId: string): Promise<AmbitoSerie> {
    const empresaDeSucursal = await this.dependencias.ubicaciones.empresaDeSucursal(sucursalId);
    if (!empresaDeSucursal) throw new NotFoundError('La sucursal no existe');
    if (empresaDeSucursal !== empresaId) throw new AmbitoSerieInvalidoError('La sucursal no pertenece a la empresa');
    return { empresaId, sucursalId, unidadId: null };
  }
}
