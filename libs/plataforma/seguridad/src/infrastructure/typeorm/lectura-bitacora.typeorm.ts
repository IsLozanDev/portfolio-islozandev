import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SelectQueryBuilder } from 'typeorm';
import type { EventoBitacora, EventoBitacoraDetalle, FiltroBitacora, LecturaBitacora } from '../../application/ports/lectura-bitacora.js';
import type { Listado } from '../../application/ports/lectura-miembros.js';
import type { TipoEventoSeguridad } from '../../application/ports/repositorios.js';
import type { Fecha } from '../../domain/asignacion.js';
import { EventoSeguridadEntidad, UsuarioLecturaEntidad, type FilaEventoSeguridad } from './entidades-lectura.js';

/** America/Lima no tiene horario de verano: el día calendario empieza siempre a las 05:00 UTC. */
const DESFASE_LIMA = '-05:00';
const MILISEGUNDOS_POR_DIA = 86_400_000;

// `\` es el escape por defecto de LIKE en PostgreSQL: lo que escribe el usuario se busca literal.
const COMODINES_DE_LIKE = /[\\%_]/g;

/** Qué clave del detalle resume cada tipo en la lista. */
const CLAVE_DE_RESUMEN: Readonly<Partial<Record<TipoEventoSeguridad, string>>> = {
  ACCESO_DENEGADO: 'permiso',
  ACCESO_SOPORTE: 'ticket',
  ASIGNACION_OTORGADA: 'alcance',
  ASIGNACION_REVOCADA: 'motivo',
};

interface FilaEventoListado {
  id: string;
  tipo: TipoEventoSeguridad;
  ocurrido_en: Date;
  detalle: Record<string, unknown>;
  ip: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_correo: string | null;
}

/** Bitácora del tenant del contexto. Filtra por tenant además de la RLS (regla 3). */
export class LecturaBitacoraTypeOrm implements LecturaBitacora {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(filtro: FiltroBitacora): Promise<Listado<EventoBitacora>> {
    const consulta = this.eventos()
      .andWhere('evento.ocurridoEn >= :inicio', { inicio: inicioDelDia(filtro.desde) })
      .andWhere('evento.ocurridoEn < :fin', { fin: inicioDelDiaSiguiente(filtro.hasta) });
    if (filtro.tipo) consulta.andWhere('evento.tipo = :tipo', { tipo: filtro.tipo });
    if (filtro.usuario) {
      consulta.andWhere('(usuario.correo ILIKE :patron OR usuario.nombre ILIKE :patron)', { patron: patronDeBusqueda(filtro.usuario) });
    }
    const total = await consulta.getCount();
    const filas = await this.conColumnas(consulta)
      .orderBy('evento.ocurridoEn', 'DESC')
      .addOrderBy('evento.id', 'DESC')
      .offset((filtro.pagina - 1) * filtro.tamano)
      .limit(filtro.tamano)
      .getRawMany<FilaEventoListado>();
    return { items: filas.map(eventoListado), total };
  }

  async detalle(id: string): Promise<EventoBitacoraDetalle | null> {
    const fila = await this.conColumnas(this.eventos().andWhere('evento.id = :id', { id })).getRawOne<FilaEventoListado>();
    if (!fila) return null;
    return { ...eventoListado(fila), ip: fila.ip, detalle: fila.detalle };
  }

  private eventos(): SelectQueryBuilder<FilaEventoSeguridad> {
    return this.unidadDeTrabajo.manager
      .getRepository(EventoSeguridadEntidad)
      .createQueryBuilder('evento')
      .leftJoin(UsuarioLecturaEntidad.options.name, 'usuario', 'usuario.id = evento.usuarioId')
      .where('evento.tenantId = :tenantId', { tenantId: this.contexto.current().tenantId });
  }

  private conColumnas(consulta: SelectQueryBuilder<FilaEventoSeguridad>): SelectQueryBuilder<FilaEventoSeguridad> {
    return consulta
      .select('evento.id', 'id')
      .addSelect('evento.tipo', 'tipo')
      .addSelect('evento.ocurridoEn', 'ocurrido_en')
      .addSelect('evento.detalle', 'detalle')
      .addSelect('host(evento.ip)', 'ip')
      .addSelect('usuario.id', 'usuario_id')
      .addSelect('usuario.nombre', 'usuario_nombre')
      .addSelect('usuario.correo', 'usuario_correo');
  }
}

function inicioDelDia(fecha: Fecha): Date {
  return new Date(`${fecha}T00:00:00${DESFASE_LIMA}`);
}

function inicioDelDiaSiguiente(fecha: Fecha): Date {
  return new Date(inicioDelDia(fecha).getTime() + MILISEGUNDOS_POR_DIA);
}

function patronDeBusqueda(texto: string): string {
  return `%${texto.replace(COMODINES_DE_LIKE, (comodin) => `\\${comodin}`)}%`;
}

function resumenDe(tipo: TipoEventoSeguridad, detalle: Record<string, unknown>): string | null {
  const clave = CLAVE_DE_RESUMEN[tipo];
  const valor = clave ? detalle[clave] : undefined;
  return typeof valor === 'string' ? valor : null;
}

function eventoListado(fila: FilaEventoListado): EventoBitacora {
  return {
    id: String(fila.id),
    tipo: fila.tipo,
    ocurridoEn: fila.ocurrido_en,
    usuario: fila.usuario_id && fila.usuario_nombre !== null && fila.usuario_correo !== null
      ? { id: fila.usuario_id, nombre: fila.usuario_nombre, correo: fila.usuario_correo }
      : null,
    resumen: resumenDe(fila.tipo, fila.detalle),
  };
}
