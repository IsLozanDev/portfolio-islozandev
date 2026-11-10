import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SelectQueryBuilder } from 'typeorm';
import type {
  AlcanceLectura,
  EventoAuditoriaCompleto,
  EventoAuditoriaResumen,
  FiltroResuelto,
  LecturaAuditoria,
} from '../../application/ports/lectura-auditoria.port.js';
import type { Paginacion } from '../../domain/filtro-auditoria.js';
import { EventoAuditoriaEntidad, type FilaEventoAuditoria } from './entidades.js';

/** Expresión del SELECT y el alias con que vuelve: el nombre del campo del puerto. */
type Columna = readonly [string, keyof EventoAuditoriaCompleto];

/** America/Lima no tiene horario de verano: el día calendario empieza siempre a las 05:00 UTC. */
const DESFASE_LIMA = '-05:00';
const MILISEGUNDOS_POR_DIA = 86_400_000;
/** Lote de la exportación: memoria acotada sin offset. */
const TAMANO_LOTE_EXPORTACION = 1_000;

/** El cursor lleva la fecha como texto: `Date` pierde los microsegundos y el keyset saltaría filas. */
interface FilaConCursor extends EventoAuditoriaCompleto {
  cursorFecha: string;
}

interface CursorExportacion {
  fecha: string;
  id: string;
}

/** Columnas de la lista: sin antes ni despues, que pueden llegar a 64 KB cada una. */
const COLUMNAS_RESUMEN: readonly Columna[] = [
  ['evento.id', 'id'],
  ['CAST(evento.numero AS text)', 'numero'],
  ['evento.tipo', 'tipo'],
  ['evento.origen', 'origen'],
  ['evento.accion', 'accion'],
  ['evento.entidadTipo', 'entidadTipo'],
  ['evento.entidadId', 'entidadId'],
  ['evento.usuarioId', 'usuarioId'],
  ['evento.sucursalId', 'sucursalId'],
  ['evento.motivo', 'motivo'],
  ['evento.finalidad', 'finalidad'],
  ['evento.ticket', 'ticket'],
  ['evento.personaTitularId', 'personaTitularId'],
  ['host(evento.ip)', 'ip'],
  ['evento.ocurridoEn', 'ocurridoEn'],
];

const COLUMNAS_DETALLE: readonly Columna[] = [
  ...COLUMNAS_RESUMEN,
  ['evento.antes', 'antes'],
  ['evento.despues', 'despues'],
  ['evento.traceId', 'traceId'],
  ['evento.eventId', 'eventId'],
  ['evento.hashAnterior', 'hashAnterior'],
  ['evento.hash', 'hash'],
];

/** Auditoría del tenant del contexto. Filtra por tenant además de la RLS (regla 3). Sin uniones con seg ni org. */
export class LecturaAuditoriaTypeOrm implements LecturaAuditoria {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(filtro: FiltroResuelto, paginacion: Paginacion): Promise<{ items: EventoAuditoriaResumen[]; total: number }> {
    const consulta = this.filtrados(filtro);
    const total = await consulta.getCount();
    const items = await ordenDeLista(conColumnas(consulta, COLUMNAS_RESUMEN))
      .offset((paginacion.pagina - 1) * paginacion.tamano)
      .limit(paginacion.tamano)
      .getRawMany<EventoAuditoriaResumen>();
    return { items, total };
  }

  async buscar(id: string, alcance: AlcanceLectura): Promise<EventoAuditoriaCompleto | null> {
    const consulta = conAlcance(this.delTenant().andWhere('evento.id = :id', { id }), alcance);
    const fila = await conColumnas(consulta, COLUMNAS_DETALLE).getRawOne<EventoAuditoriaCompleto>();
    return fila ?? null;
  }

  contar(filtro: FiltroResuelto): Promise<number> {
    return this.filtrados(filtro).getCount();
  }

  async recorrer(filtro: FiltroResuelto, alLote: (eventos: EventoAuditoriaCompleto[]) => Promise<void>): Promise<void> {
    let cursor: CursorExportacion | null = null;
    for (;;) {
      const filas = await this.loteExportado(filtro, cursor);
      if (filas.length === 0) return;
      await alLote(filas);
      if (filas.length < TAMANO_LOTE_EXPORTACION) return;
      const ultima = filas[filas.length - 1];
      cursor = { fecha: ultima.cursorFecha, id: ultima.id };
    }
  }

  private loteExportado(filtro: FiltroResuelto, cursor: CursorExportacion | null): Promise<FilaConCursor[]> {
    const consulta = conColumnas(this.filtrados(filtro), COLUMNAS_DETALLE).addSelect('CAST(evento.ocurridoEn AS text)', 'cursorFecha');
    if (cursor) {
      consulta.andWhere('(evento.ocurridoEn, evento.id) < (CAST(:fechaCursor AS timestamptz), CAST(:idCursor AS uuid))', {
        fechaCursor: cursor.fecha,
        idCursor: cursor.id,
      });
    }
    return consulta.orderBy('evento.ocurridoEn', 'DESC').addOrderBy('evento.id', 'DESC').limit(TAMANO_LOTE_EXPORTACION).getRawMany<FilaConCursor>();
  }

  private filtrados(filtro: FiltroResuelto): SelectQueryBuilder<FilaEventoAuditoria> {
    const consulta = conAlcance(this.delTenant(), filtro)
      .andWhere('evento.ocurridoEn >= :inicio', { inicio: inicioDelDia(filtro.desde) })
      .andWhere('evento.ocurridoEn < :fin', { fin: inicioDelDiaSiguiente(filtro.hasta) });
    if (filtro.usuarioIds) consulta.andWhere('evento.usuarioId IN (:...usuarioIds)', { usuarioIds: filtro.usuarioIds });
    if (filtro.accion) consulta.andWhere('evento.accion = :accion', { accion: filtro.accion });
    if (filtro.entidadTipo) consulta.andWhere('evento.entidadTipo = :entidadTipo', { entidadTipo: filtro.entidadTipo });
    if (filtro.entidadId) consulta.andWhere('evento.entidadId = :entidadId', { entidadId: filtro.entidadId });
    if (filtro.sucursalId) consulta.andWhere('evento.sucursalId = :sucursalId', { sucursalId: filtro.sucursalId });
    if (filtro.tipo) consulta.andWhere('evento.tipo = :tipo', { tipo: filtro.tipo });
    if (filtro.personaTitularId) consulta.andWhere('evento.personaTitularId = :personaTitularId', { personaTitularId: filtro.personaTitularId });
    return consulta;
  }

  private delTenant(): SelectQueryBuilder<FilaEventoAuditoria> {
    return this.unidadDeTrabajo.manager
      .getRepository(EventoAuditoriaEntidad)
      .createQueryBuilder('evento')
      .where('evento.tenantId = :tenantId', { tenantId: this.contexto.current().tenantId });
  }
}

/** Sin alcance TENANT solo la sucursal forzada: las filas sin sucursal quedan fuera (TR-CA-214). */
function conAlcance(consulta: SelectQueryBuilder<FilaEventoAuditoria>, alcance: AlcanceLectura): SelectQueryBuilder<FilaEventoAuditoria> {
  if (!alcance.sucursalForzada) return consulta;
  return consulta.andWhere('evento.sucursalId = :sucursalForzada', { sucursalForzada: alcance.sucursalForzada });
}

/** Reemplaza el SELECT por las columnas dadas. */
function conColumnas(consulta: SelectQueryBuilder<FilaEventoAuditoria>, columnas: readonly Columna[]): SelectQueryBuilder<FilaEventoAuditoria> {
  const [[primera, aliasPrimera], ...resto] = columnas;
  return resto.reduce((acumulada, [expresion, alias]) => acumulada.addSelect(expresion, alias), consulta.select(primera, aliasPrimera));
}

function ordenDeLista(consulta: SelectQueryBuilder<FilaEventoAuditoria>): SelectQueryBuilder<FilaEventoAuditoria> {
  return consulta.orderBy('evento.ocurridoEn', 'DESC').addOrderBy('evento.numero', 'DESC');
}

function inicioDelDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00${DESFASE_LIMA}`);
}

function inicioDelDiaSiguiente(fecha: string): Date {
  return new Date(inicioDelDia(fecha).getTime() + MILISEGUNDOS_POR_DIA);
}
