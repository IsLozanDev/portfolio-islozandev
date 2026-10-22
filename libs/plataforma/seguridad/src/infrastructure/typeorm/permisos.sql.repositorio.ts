import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { ConsultaPermisos, OpcionMenu, PermisosRepositorio, SucursalAccesible, VersionesSeguridad } from '../../application/ports/permisos.port.js';
import { RepositorioBase } from './repositorio-base.js';

/** Llama a las funciones de seg (SECURITY INVOKER): corren con la RLS y el app.tenant_id de la UoW. */
export class PermisosSqlRepositorio extends RepositorioBase implements PermisosRepositorio {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async versiones(tenantId: string): Promise<VersionesSeguridad> {
    const [fila] = await this.consultar<{ vt: string; vc: string }>('SELECT vt, vc FROM seg.versiones_seguridad($1)', [tenantId]);
    // Sin fila solo si tenantId no es el del contexto: la función no devuelve datos de otro tenant.
    if (!fila) throw new Error('El tenant de la consulta no es el del contexto');
    return { vt: Number(fila.vt), vc: Number(fila.vc) };
  }

  async efectivos({ usuarioId, tenantId, sucursalId, unidadId }: ConsultaPermisos): Promise<string[]> {
    const filas = await this.consultar<{ permiso_codigo: string }>('SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3, $4) ORDER BY 1', [
      usuarioId,
      tenantId,
      sucursalId,
      unidadId ?? null,
    ]);
    return filas.map((f) => f.permiso_codigo);
  }

  async menu({ usuarioId, tenantId, sucursalId, unidadId }: ConsultaPermisos): Promise<OpcionMenu[]> {
    const filas = await this.consultar<{ opcion_id: string; padre_id: string | null; codigo: string; nombre: string; ruta: string | null; icono: string | null; orden: number }>(
      'SELECT * FROM seg.menu_usuario($1, $2, $3, $4) ORDER BY orden, codigo',
      [usuarioId, tenantId, sucursalId, unidadId ?? null],
    );
    // menu_usuario trae los ancestros: todo padre está en las mismas filas.
    const codigoDe = new Map(filas.map((f) => [f.opcion_id, f.codigo]));
    return filas.map((f) => ({
      codigo: f.codigo,
      padre: f.padre_id === null ? null : (codigoDe.get(f.padre_id) ?? null),
      nombre: f.nombre,
      ruta: f.ruta,
      icono: f.icono,
      orden: f.orden,
    }));
  }

  async sucursalesAccesibles(usuarioId: string, tenantId: string): Promise<SucursalAccesible[]> {
    const filas = await this.consultar<{ sucursal_id: string; empresa_id: string; codigo: string; nombre: string }>(
      'SELECT * FROM seg.sucursales_accesibles($1, $2) ORDER BY nombre',
      [usuarioId, tenantId],
    );
    return filas.map((f) => ({ id: f.sucursal_id, empresaId: f.empresa_id, codigo: f.codigo, nombre: f.nombre }));
  }
}
