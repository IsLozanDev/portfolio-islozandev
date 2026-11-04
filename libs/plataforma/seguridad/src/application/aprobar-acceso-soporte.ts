import { ConflictError, NotFoundError, type Clock, type EventPublisher, type IdGenerator, type TenantContext, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { vigenciaSoporte, type AccesoSoporte } from '../domain/acceso-soporte.js';
import { Asignacion } from '../domain/asignacion.js';
import { SoporteAgenteEsMiembroError, TransicionSoporteError } from '../domain/errores.js';
import { Membresia } from '../domain/membresia.js';
import type { Rol } from '../domain/rol.js';
import { cargarAcceso } from './cerrar-acceso-soporte.js';
import { fechaLocal } from './otorgar-asignacion.js';
import type { RepositorioAccesosSoporte } from './ports/acceso-soporte.repositorio.js';
import type { BitacoraSeguridad, CatalogoPermisos, RepositorioAsignaciones, RepositorioMembresias, RepositorioPerfiles, RepositorioRoles } from './ports/repositorios.js';
import { exigirRolesDentroDelTecho, permisosPlatDelCliente } from './productos-del-cliente.js';
import { publicarEventos } from './publicar-eventos.js';

export interface AprobarAccesoSoporteComando {
  accesoId: string;
  horas: number;
  /** Uno de los dos: con lo que el agente opera en el tenant (alcance TENANT). */
  rolId: string | null;
  perfilId: string | null;
  aprobadoPor: string;
  ip?: string | null;
}

export interface DependenciasAprobacionSoporte {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  accesos: RepositorioAccesosSoporte;
  membresias: RepositorioMembresias;
  asignaciones: RepositorioAsignaciones;
  roles: RepositorioRoles;
  perfiles: RepositorioPerfiles;
  catalogo: CatalogoPermisos;
  bitacora: BitacoraSeguridad;
}

export interface AccesoAprobado {
  desde: Date;
  hasta: Date;
}

/** Resultado de la transacción: la caducada se expira y se confirma antes de responder el error. */
type ResultadoAprobacion = { tipo: 'APROBADO'; acceso: AccesoAprobado } | { tipo: 'CADUCADA' };

/**
 * El administrador del cliente aprueba con vigencia de 1 a 4 h y elige el rol o perfil del agente
 * (TR-RF-020 pasos 2 y 3). Crea o reabre la membresía del agente y le otorga la asignación.
 */
export class AprobarAccesoSoporte {
  constructor(private readonly dependencias: DependenciasAprobacionSoporte) {}

  async ejecutar(comando: AprobarAccesoSoporteComando): Promise<AccesoAprobado> {
    vigenciaSoporte(comando.horas);
    const { unidadDeTrabajo, accesos, reloj } = this.dependencias;
    const resultado = await unidadDeTrabajo.run(async (): Promise<ResultadoAprobacion> => {
      const ahora = reloj.now();
      const acceso = await cargarAcceso(accesos, comando.accesoId);
      if (acceso.caducada(ahora)) {
        await this.expirarCaducada(acceso, ahora);
        return { tipo: 'CADUCADA' };
      }
      return { tipo: 'APROBADO', acceso: await this.aprobar(acceso, comando, ahora) };
    });
    if (resultado.tipo === 'CADUCADA') throw new TransicionSoporteError('EXPIRADO', 'aprobar');
    return resultado.acceso;
  }

  private async aprobar(acceso: AccesoSoporte, comando: AprobarAccesoSoporteComando, ahora: Date): Promise<AccesoAprobado> {
    const { ids, contexto, membresias, asignaciones, accesos, eventos, catalogo } = this.dependencias;
    const permisos = await catalogo.permisos(await this.permisosDelDestino(comando));
    const previa = await membresias.deUsuario(acceso.agenteId);
    const membresiaId = previa?.id ?? ids.next();
    const asignacionId = ids.next();
    // Primero la transición (estado y autoaprobación); después, si el agente ya es miembro del tenant.
    const { desde, hasta } = acceso.aprobar({ aprobadoPor: comando.aprobadoPor, horas: comando.horas, membresiaId, asignacionId }, ahora);
    if (previa && previa.estado !== 'FINALIZADO') throw new SoporteAgenteEsMiembroError();

    const membresia = previa ?? Membresia.abrirSoporte(membresiaId, { usuarioId: acceso.agenteId, tenantId: acceso.tenantId, hasta }, ahora);
    if (previa) previa.reabrirSoporte(hasta, ahora);
    const hoy = fechaLocal(ahora);
    const asignacion = Asignacion.otorgar(
      asignacionId,
      contexto.current().tenantId,
      {
        membresiaId,
        rolId: comando.rolId,
        perfilId: comando.perfilId,
        alcance: 'TENANT',
        empresaId: null,
        sucursalId: null,
        unidadId: null,
        vigenteDesde: hoy,
        vigenteHasta: fechaLocal(hasta),
      },
      { hoy, otorgadoPor: comando.aprobadoPor, permisos },
    );

    await membresias.guardar(membresia);
    await asignaciones.guardar(asignacion);
    await accesos.guardar(acceso);
    await this.registrar(acceso, asignacion, comando, hasta);
    await publicarEventos(eventos, acceso, membresia, asignacion);
    return { desde, hasta };
  }

  /** Permisos del rol o de los roles activos del perfil, dentro del techo PLAT del cliente (spec 16b). */
  private async permisosDelDestino({ rolId, perfilId }: AprobarAccesoSoporteComando): Promise<string[]> {
    const { roles, perfiles, catalogo } = this.dependencias;
    let elegidos: Rol[] = [];
    if (rolId !== null) {
      const rol = await roles.buscar(rolId);
      if (!rol) throw new NotFoundError('El rol no existe');
      if (!rol.activo) throw new ConflictError('El rol está inactivo u obsoleto');
      elegidos = [rol];
    } else if (perfilId !== null) {
      const perfil = await perfiles.buscar(perfilId);
      if (!perfil) throw new NotFoundError('El perfil no existe');
      elegidos = (await roles.buscarVarios(perfil.roles)).filter((rol) => rol.activo);
    }
    exigirRolesDentroDelTecho(elegidos, await permisosPlatDelCliente(catalogo));
    return elegidos.flatMap((rol) => [...rol.permisos]);
  }

  private async registrar(acceso: AccesoSoporte, asignacion: Asignacion, comando: AprobarAccesoSoporteComando, hasta: Date): Promise<void> {
    const { bitacora } = this.dependencias;
    const ip = comando.ip ?? null;
    await bitacora.registrar(
      'ACCESO_SOPORTE',
      comando.aprobadoPor,
      {
        accion: 'APROBADO',
        acceso_id: acceso.id,
        ticket: acceso.ticket,
        agente_id: acceso.agenteId,
        horas: acceso.horasAprobadas,
        hasta: hasta.toISOString(),
      },
      ip,
    );
    await bitacora.registrar(
      'ASIGNACION_OTORGADA',
      comando.aprobadoPor,
      {
        origen: 'SOPORTE',
        acceso_id: acceso.id,
        asignacion_id: asignacion.id,
        membresia_id: asignacion.membresiaId,
        usuario_destino: acceso.agenteId,
        rol_id: asignacion.rolId,
        perfil_id: asignacion.perfilId,
        alcance: asignacion.alcance,
      },
      ip,
    );
  }

  private async expirarCaducada(acceso: AccesoSoporte, ahora: Date): Promise<void> {
    const { accesos, bitacora, eventos } = this.dependencias;
    acceso.expirar(ahora);
    await accesos.guardar(acceso);
    await bitacora.registrar('ACCESO_SOPORTE', null, { accion: 'EXPIRADO', acceso_id: acceso.id, ticket: acceso.ticket, estado_anterior: 'PENDIENTE' });
    await publicarEventos(eventos, acceso);
  }
}
