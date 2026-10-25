import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SelectQueryBuilder } from 'typeorm';
import type { FiltroSeries, LecturaSeries, SerieDetalle, SerieListada } from '../../application/ports/lectura-series.js';
import type { Reinicio, TipoDocumento } from '../../domain/tipos.js';
import { EmpresaSerieEntidad, SucursalSerieEntidad, UnidadSerieEntidad } from './entidades-org.js';
import { SerieEntidad, type FilaSerie } from './entidades.js';

/**
 * Vista previa del siguiente número con el mismo periodo que seq.siguiente (seq.periodo_de y
 * seq.zona_de): una sola implementación del reinicio, en la base. Función de base de datos (regla 11).
 */
const SIGUIENTE_NUMERO = `CASE WHEN serie.periodo IS DISTINCT FROM seq.periodo_de(serie.reinicio, seq.zona_de(serie.sucursal_id), :instante)
  THEN 1 ELSE serie.ultimo_numero + 1 END`;

interface FilaListada {
  id: string;
  empresa_id: string;
  sucursal_id: string | null;
  unidad_id: string | null;
  tipo: TipoDocumento;
  serie: string;
  digitos: number;
  reinicio: Reinicio;
  /** bigint: node-pg lo devuelve como string. */
  ultimo_numero: string;
  periodo: string | null;
  activa: boolean;
  siguiente_numero: string;
}

interface FilaDetalle extends FilaListada {
  empresa_nombre: string;
  sucursal_nombre: string | null;
  unidad_nombre: string | null;
  creado_por: string;
  creado_en: Date;
  modificado_por: string;
  modificado_en: Date;
}

/** Series del tenant del contexto. Filtra por tenant además de la RLS (regla 3). */
export class LecturaSeriesTypeOrm implements LecturaSeries {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(filtro: FiltroSeries, instante: Date): Promise<SerieListada[]> {
    const consulta = this.consultaBase(instante).orderBy('serie.tipo').addOrderBy('serie.serie');
    if (filtro.empresaId) consulta.andWhere('serie.empresaId = :empresaId', { empresaId: filtro.empresaId });
    if (filtro.sucursalId) consulta.andWhere('serie.sucursalId = :sucursalId', { sucursalId: filtro.sucursalId });
    if (filtro.tipo) consulta.andWhere('serie.tipo = :tipo', { tipo: filtro.tipo });
    if (filtro.activa !== undefined) consulta.andWhere('serie.activa = :activa', { activa: filtro.activa });
    return (await consulta.getRawMany<FilaListada>()).map(serieListada);
  }

  async consultar(id: string, instante: Date): Promise<SerieDetalle | null> {
    const fila = await this.consultaBase(instante)
      .innerJoin(EmpresaSerieEntidad.options.name, 'empresa', 'empresa.id = serie.empresaId AND empresa.tenantId = serie.tenantId')
      .leftJoin(SucursalSerieEntidad.options.name, 'sucursal', 'sucursal.id = serie.sucursalId AND sucursal.tenantId = serie.tenantId')
      .leftJoin(UnidadSerieEntidad.options.name, 'unidad', 'unidad.id = serie.unidadId AND unidad.tenantId = serie.tenantId')
      .addSelect('empresa.razonSocial', 'empresa_nombre')
      .addSelect('sucursal.nombre', 'sucursal_nombre')
      .addSelect('unidad.nombre', 'unidad_nombre')
      .addSelect('serie.creadoPor', 'creado_por')
      .addSelect('serie.creadoEn', 'creado_en')
      .addSelect('serie.modificadoPor', 'modificado_por')
      .addSelect('serie.modificadoEn', 'modificado_en')
      .andWhere('serie.id = :id', { id })
      .getRawOne<FilaDetalle>();
    if (!fila) return null;
    return {
      ...serieListada(fila),
      empresaNombre: fila.empresa_nombre,
      sucursalNombre: fila.sucursal_nombre,
      unidadNombre: fila.unidad_nombre,
      creadoPor: fila.creado_por,
      creadoEn: fila.creado_en,
      modificadoPor: fila.modificado_por,
      modificadoEn: fila.modificado_en,
    };
  }

  private consultaBase(instante: Date): SelectQueryBuilder<FilaSerie> {
    return this.unidadDeTrabajo.manager
      .getRepository(SerieEntidad)
      .createQueryBuilder('serie')
      .select('serie.id', 'id')
      .addSelect('serie.empresaId', 'empresa_id')
      .addSelect('serie.sucursalId', 'sucursal_id')
      .addSelect('serie.unidadId', 'unidad_id')
      .addSelect('serie.tipo', 'tipo')
      .addSelect('serie.serie', 'serie')
      .addSelect('serie.digitos', 'digitos')
      .addSelect('serie.reinicio', 'reinicio')
      .addSelect('serie.ultimoNumero', 'ultimo_numero')
      .addSelect('serie.periodo', 'periodo')
      .addSelect('serie.activa', 'activa')
      .addSelect(SIGUIENTE_NUMERO, 'siguiente_numero')
      .where('serie.tenantId = :tenantId', { tenantId: this.contexto.current().tenantId })
      .setParameter('instante', instante);
  }
}

function serieListada(fila: FilaListada): SerieListada {
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    sucursalId: fila.sucursal_id,
    unidadId: fila.unidad_id,
    tipo: fila.tipo,
    serie: fila.serie,
    digitos: fila.digitos,
    reinicio: fila.reinicio,
    ultimoNumero: Number(fila.ultimo_numero),
    periodo: fila.periodo,
    activa: fila.activa,
    siguienteNumero: Number(fila.siguiente_numero),
  };
}
