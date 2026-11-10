import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import type { SucursalDirectorio, UsuarioDirectorio } from '@vitrina/plataforma/seguridad';
import { validarFiltroAuditoria, validarPaginacion, type FiltroAuditoria, type Paginacion } from '../domain/filtro-auditoria.js';
import { PERMISOS_AUD } from '../domain/permisos-aud.js';
import { nombresDe, resolverFiltro, type DependenciasAlcance, type NombresDeEventos } from './alcance-auditoria.js';
import type { EventoAuditoriaResumen, LecturaAuditoria } from './ports/lectura-auditoria.port.js';

export interface DependenciasConsultaAuditoria extends DependenciasAlcance {
  unidadDeTrabajo: UnitOfWork;
  lectura: LecturaAuditoria;
}

/** Fila de la lista con el nombre y correo de quien actuó y el código y nombre de la sucursal; null si fue el sistema. */
export interface EventoAuditoriaListado extends EventoAuditoriaResumen {
  usuario: UsuarioDirectorio | null;
  sucursal: SucursalDirectorio | null;
}

export interface ListadoAuditoria {
  items: EventoAuditoriaListado[];
  total: number;
}

const LISTADO_VACIO: ListadoAuditoria = { items: [], total: 0 };

/** Lista paginada de la auditoría con el alcance del actor del contexto (TR-RF-086, TR-CA-213, TR-CA-214). */
export class ConsultarAuditoria {
  constructor(private readonly dependencias: DependenciasConsultaAuditoria) {}

  async ejecutar(filtro: FiltroAuditoria, paginacion: Partial<Paginacion>): Promise<ListadoAuditoria> {
    const filtroValido = validarFiltroAuditoria(filtro);
    const pagina = validarPaginacion(paginacion);
    const { unidadDeTrabajo, lectura, directorio } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const resuelto = await resolverFiltro(this.dependencias, filtroValido, PERMISOS_AUD.consultar);
      if (!resuelto) return LISTADO_VACIO;
      const { items, total } = await lectura.listar(resuelto, pagina);
      const nombres = await nombresDe(directorio, items);
      return { items: items.map((evento) => conNombres(evento, nombres)), total };
    });
  }
}

export function conNombres<T extends EventoAuditoriaResumen>(evento: T, nombres: NombresDeEventos): T & Pick<EventoAuditoriaListado, 'usuario' | 'sucursal'> {
  return {
    ...evento,
    usuario: (evento.usuarioId && nombres.usuarios.get(evento.usuarioId)) || null,
    sucursal: (evento.sucursalId && nombres.sucursales.get(evento.sucursalId)) || null,
  };
}
