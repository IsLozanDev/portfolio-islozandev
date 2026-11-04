import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { SucursalNoAsignadaError } from '../domain/errores.js';
import { contextoDeSoporte } from './contexto-soporte.js';
import type { LecturaSoporte, SesionSoporte } from './ports/lectura-soporte.js';
import type { OpcionMenu, PermisosRepositorio, PermisosResueltos, SucursalAccesible } from './ports/permisos.port.js';
import type { MembresiasLectura, PreferenciaSucursal } from './ports/repositorios.js';
import type { ResolverAccesoSoporteVigente } from './resolver-acceso-soporte.js';
import type { Aviso, ResolverPermisos } from './resolver-permisos.js';

export interface MiContextoConsulta {
  usuarioId: string;
  tenantId: string;
  /** `X-Sucursal-Id`, ya validado como UUID. */
  sucursalSolicitada?: string;
}

export interface MiContexto {
  sucursales: SucursalAccesible[];
  sucursalActual: string | null;
  requiereSeleccion: boolean;
  sinAccesos: boolean;
  permisos: string[];
  menu: OpcionMenu[];
  /** Acceso de soporte vigente en este tenant: banner del shell (TR-RNF-110). */
  soporte: SesionSoporte | null;
}

/** Con qué se sabe si el usuario entra como soporte y qué opciones del menú ocultarle (spec 18). */
export interface SoporteDelContexto {
  resolver: Pick<ResolverAccesoSoporteVigente, 'ejecutar'>;
  lectura: Pick<LecturaSoporte, 'permisosDeOpciones'>;
}

/** TR-CA-044 a 046 (parte back): sucursales accesibles, la actual y sus permisos y menú. */
export class ObtenerMiContexto {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly contexto: TenantContext,
    private readonly permisos: PermisosRepositorio,
    private readonly membresias: MembresiasLectura,
    private readonly preferencia: PreferenciaSucursal,
    private readonly resolver: ResolverPermisos,
    private readonly soporte: SoporteDelContexto,
    private readonly aviso: Aviso = () => undefined,
  ) {}

  /** SucursalNoAsignadaError si la sucursal solicitada no está entre las accesibles. */
  async ejecutar({ usuarioId, tenantId, sucursalSolicitada }: MiContextoConsulta): Promise<MiContexto> {
    const { sucursales, membresia } = await this.enTenant(tenantId, async () => ({
      sucursales: await this.permisos.sucursalesAccesibles(usuarioId, tenantId),
      membresia: await this.membresias.deUsuario(usuarioId),
    }));
    const accesible = (id: string | null | undefined): id is string => sucursales.some((s) => s.id === id);
    if (sucursalSolicitada !== undefined && !accesible(sucursalSolicitada)) throw new SucursalNoAsignadaError();

    const ultima = membresia?.ultimaSucursalId;
    const actual = sucursalSolicitada ?? (sucursales.length === 1 ? sucursales[0].id : accesible(ultima) ? ultima : null);
    const sesionSoporte = await this.soporte.resolver.ejecutar(usuarioId, tenantId);
    const base = {
      sucursales,
      sucursalActual: actual,
      requiereSeleccion: actual === null && sucursales.length > 1,
      sinAccesos: sucursales.length === 0,
      soporte: sesionSoporte,
    };
    if (actual === null) return { ...base, permisos: [], menu: [] };

    if (sucursalSolicitada !== undefined && membresia && ultima !== actual) this.recordar(tenantId, membresia.id, actual);
    const resueltos = await this.resolver.ejecutar({ usuarioId, tenantId, sucursalId: actual });
    const { permisos, menu } = sesionSoporte ? await this.paraSoporte(tenantId, resueltos) : resueltos;
    return { ...base, permisos, menu };
  }

  private async paraSoporte(tenantId: string, resueltos: PermisosResueltos): Promise<PermisosResueltos> {
    const codigos = resueltos.menu.map((opcion) => opcion.codigo);
    const permisosPorOpcion = await this.enTenant(tenantId, () => this.soporte.lectura.permisosDeOpciones(codigos));
    return contextoDeSoporte(resueltos, permisosPorOpcion);
  }

  /** Sin esperar: la respuesta no depende de que la preferencia se guarde. */
  private recordar(tenantId: string, membresiaId: string, sucursalId: string): void {
    this.enTenant(tenantId, () => this.preferencia.recordar(membresiaId, sucursalId)).catch((error: unknown) =>
      this.aviso('No se pudo recordar la última sucursal', { evento: 'seg.ultima_sucursal.falla', error: error instanceof Error ? error.name : typeof error }),
    );
  }

  private enTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.contexto.run({ tenantId }, () => this.uow.run(fn));
  }
}
