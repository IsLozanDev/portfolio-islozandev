import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { SelectQueryBuilder } from 'typeorm';
import type {
  AsignadoDelEvento,
  EventoBitacora,
  EventoBitacoraDetalle,
  EventoBitacoraExportado,
  FiltroBitacora,
  FiltroExportacion,
  LecturaBitacora,
  UsuarioDelEvento,
} from '../../application/ports/lectura-bitacora.js';
import type { Listado } from '../../application/ports/lectura-miembros.js';
import type { TipoEventoSeguridad } from '../../application/ports/repositorios.js';
import type { Fecha } from '../../domain/asignacion.js';
import {
  AsignacionLecturaEntidad,
  EventoSeguridadEntidad,
  MembresiaLecturaEntidad,
  PerfilLecturaEntidad,
  RolLecturaEntidad,
  UsuarioLecturaEntidad,
  type FilaEventoSeguridad,
} from './entidades-lectura.js';

/** America/Lima no tiene horario de verano: el día calendario empieza siempre a las 05:00 UTC. */
const DESFASE_LIMA = '-05:00';
const MILISEGUNDOS_POR_DIA = 86_400_000;

// `\` es el escape por defecto de LIKE en PostgreSQL: lo que escribe el usuario se busca literal.
const COMODINES_DE_LIKE = /[\\%_]/g;

/** Qué clave del detalle resume cada tipo en la lista; las asignaciones se resumen con rol y destinatario. */
const CLAVE_DE_RESUMEN: Readonly<Partial<Record<TipoEventoSeguridad, string>>> = {
  ACCESO_DENEGADO: 'permiso',
  ACCESO_SOPORTE: 'ticket',
  ASIGNACION_OTORGADA: 'alcance',
  ASIGNACION_REVOCADA: 'motivo',
  // Spec 18b: el método del ingreso, el motivo del fallo y las filas exportadas.
  LOGIN: 'metodo',
  LOGIN_FALLIDO: 'motivo',
  EXPORTACION: 'filas',
};

/** Lote de la exportación: memoria acotada sin offset. */
const TAMANO_LOTE_EXPORTACION = 1_000;

const TIPOS_DE_ASIGNACION: readonly TipoEventoSeguridad[] = ['ASIGNACION_OTORGADA', 'ASIGNACION_REVOCADA'];
const SEPARADOR_DE_RESUMEN = ' → ';

interface FilaEventoListado {
  id: string;
  tipo: TipoEventoSeguridad;
  ocurrido_en: Date;
  detalle: Record<string, unknown>;
  ip: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_correo: string | null;
  destinatario_id: string | null;
  destinatario_nombre: string | null;
  destinatario_correo: string | null;
  rol_nombre: string | null;
  perfil_nombre: string | null;
}

/** El cursor lleva la fecha como texto: `Date` pierde los microsegundos y el keyset saltaría filas. */
interface FilaEventoExportado extends FilaEventoListado {
  cursor_fecha: string;
}

interface CursorExportacion {
  fecha: string;
  id: string;
}

/** Bitácora del tenant del contexto. Filtra por tenant además de la RLS (regla 3). */
export class LecturaBitacoraTypeOrm implements LecturaBitacora {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async listar(filtro: FiltroBitacora): Promise<Listado<EventoBitacora>> {
    const consulta = this.filtrados(filtro);
    const total = await consulta.getCount();
    const filas = await ordenDeLista(this.conColumnas(consulta))
      .offset((filtro.pagina - 1) * filtro.tamano)
      .limit(filtro.tamano)
      .getRawMany<FilaEventoListado>();
    return { items: filas.map(eventoListado), total };
  }

  contar(filtro: FiltroExportacion): Promise<number> {
    return this.filtrados(filtro).getCount();
  }

  async recorrer(filtro: FiltroExportacion, alLote: (eventos: EventoBitacoraExportado[]) => Promise<void>): Promise<void> {
    let cursor: CursorExportacion | null = null;
    for (;;) {
      const filas = await this.loteExportado(filtro, cursor);
      if (filas.length === 0) return;
      await alLote(filas.map((fila) => ({ ...eventoListado(fila), ip: fila.ip })));
      if (filas.length < TAMANO_LOTE_EXPORTACION) return;
      const ultima = filas[filas.length - 1];
      cursor = { fecha: ultima.cursor_fecha, id: String(ultima.id) };
    }
  }

  private loteExportado(filtro: FiltroExportacion, cursor: CursorExportacion | null): Promise<FilaEventoExportado[]> {
    const consulta = this.conColumnas(this.filtrados(filtro)).addSelect('CAST(evento.ocurridoEn AS text)', 'cursor_fecha');
    if (cursor) {
      consulta.andWhere('(evento.ocurridoEn, evento.id) < (CAST(:fechaCursor AS timestamptz), CAST(:idCursor AS bigint))', {
        fechaCursor: cursor.fecha,
        idCursor: cursor.id,
      });
    }
    return ordenDeLista(consulta).limit(TAMANO_LOTE_EXPORTACION).getRawMany<FilaEventoExportado>();
  }

  /** Rango en America/Lima, tipo y búsqueda por persona: lo mismo para la lista y la exportación. */
  private filtrados(filtro: FiltroExportacion): SelectQueryBuilder<FilaEventoSeguridad> {
    const consulta = this.eventos()
      .andWhere('evento.ocurridoEn >= :inicio', { inicio: inicioDelDia(filtro.desde) })
      .andWhere('evento.ocurridoEn < :fin', { fin: inicioDelDiaSiguiente(filtro.hasta) });
    if (filtro.tipo) consulta.andWhere('evento.tipo = :tipo', { tipo: filtro.tipo });
    if (filtro.usuario) {
      consulta.andWhere(
        '(usuario.correo ILIKE :patron OR usuario.nombre ILIKE :patron OR destinatario.correo ILIKE :patron OR destinatario.nombre ILIKE :patron)',
        { patron: patronDeBusqueda(filtro.usuario) },
      );
    }
    return consulta;
  }

  async detalle(id: string): Promise<EventoBitacoraDetalle | null> {
    const fila = await this.conColumnas(this.eventos().andWhere('evento.id = :id', { id })).getRawOne<FilaEventoListado>();
    if (!fila) return null;
    return { ...eventoListado(fila), ip: fila.ip, destinatario: destinatarioDe(fila), asignado: asignadoDe(fila), detalle: fila.detalle };
  }

  private eventos(): SelectQueryBuilder<FilaEventoSeguridad> {
    return this.unidadDeTrabajo.manager
      .getRepository(EventoSeguridadEntidad)
      .createQueryBuilder('evento')
      .leftJoin(UsuarioLecturaEntidad.options.name, 'usuario', 'usuario.id = evento.usuarioId')
      .leftJoin(AsignacionLecturaEntidad.options.name, 'asignacion', "asignacion.id = (evento.detalle ->> 'asignacion_id')::uuid")
      .leftJoin(
        MembresiaLecturaEntidad.options.name,
        'membresia',
        "membresia.id = COALESCE((evento.detalle ->> 'membresia_id')::uuid, asignacion.membresiaId)",
      )
      .leftJoin(
        UsuarioLecturaEntidad.options.name,
        'destinatario',
        "evento.tipo IN (:...tiposDeAsignacion) AND destinatario.id = COALESCE((evento.detalle ->> 'usuario_destino')::uuid, membresia.usuarioId)",
        { tiposDeAsignacion: TIPOS_DE_ASIGNACION },
      )
      .leftJoin(RolLecturaEntidad.options.name, 'rol', "rol.id = COALESCE((evento.detalle ->> 'rol_id')::uuid, asignacion.rolId)")
      .leftJoin(PerfilLecturaEntidad.options.name, 'perfil', "perfil.id = COALESCE((evento.detalle ->> 'perfil_id')::uuid, asignacion.perfilId)")
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
      .addSelect('usuario.correo', 'usuario_correo')
      .addSelect('destinatario.id', 'destinatario_id')
      .addSelect('destinatario.nombre', 'destinatario_nombre')
      .addSelect('destinatario.correo', 'destinatario_correo')
      .addSelect('rol.nombre', 'rol_nombre')
      .addSelect('perfil.nombre', 'perfil_nombre');
  }
}

function ordenDeLista(consulta: SelectQueryBuilder<FilaEventoSeguridad>): SelectQueryBuilder<FilaEventoSeguridad> {
  return consulta.orderBy('evento.ocurridoEn', 'DESC').addOrderBy('evento.id', 'DESC');
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

function persona(id: string | null, nombre: string | null, correo: string | null): UsuarioDelEvento | null {
  return id && nombre !== null && correo !== null ? { id, nombre, correo } : null;
}

function destinatarioDe(fila: FilaEventoListado): UsuarioDelEvento | null {
  return persona(fila.destinatario_id, fila.destinatario_nombre, fila.destinatario_correo);
}

function asignadoDe(fila: FilaEventoListado): AsignadoDelEvento | null {
  if (fila.rol_nombre !== null) return { tipo: 'ROL', nombre: fila.rol_nombre };
  if (fila.perfil_nombre !== null) return { tipo: 'PERFIL', nombre: fila.perfil_nombre };
  return null;
}

/** «Cajero → Juan Pérez» responde «¿quién le dio caja a este mozo?» desde la lista (TR-RF-019). */
function resumenDeAsignacion(fila: FilaEventoListado): string | null {
  const partes = [asignadoDe(fila)?.nombre, destinatarioDe(fila)?.nombre].filter((parte): parte is string => Boolean(parte));
  return partes.length > 0 ? partes.join(SEPARADOR_DE_RESUMEN) : null;
}

function resumenDe(fila: FilaEventoListado): string | null {
  if (TIPOS_DE_ASIGNACION.includes(fila.tipo)) {
    const resumen = resumenDeAsignacion(fila);
    if (resumen) return resumen;
  }
  const clave = CLAVE_DE_RESUMEN[fila.tipo];
  const valor = clave ? fila.detalle[clave] : undefined;
  if (typeof valor === 'number') return String(valor);
  return typeof valor === 'string' ? valor : null;
}

function eventoListado(fila: FilaEventoListado): EventoBitacora {
  return {
    id: String(fila.id),
    tipo: fila.tipo,
    ocurridoEn: fila.ocurrido_en,
    usuario: persona(fila.usuario_id, fila.usuario_nombre, fila.usuario_correo),
    resumen: resumenDe(fila),
  };
}
