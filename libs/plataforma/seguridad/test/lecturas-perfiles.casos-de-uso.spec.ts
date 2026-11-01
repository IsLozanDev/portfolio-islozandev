import { NotFoundError, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { ConsultarPerfil, ListarPerfiles, ListarRolesDisponibles } from '../src/application/lecturas-perfiles.js';
import { ListarRoles } from '../src/application/lecturas-roles.js';
import type { LecturaPerfiles, PerfilDetalle, PerfilListado } from '../src/application/ports/lectura-perfiles.js';
import type { LecturaRoles, RolDetalle, RolListado } from '../src/application/ports/lectura-roles.js';

const unidadDeTrabajo: UnitOfWork = { run: (trabajo) => trabajo() };

const ENCARGADO: PerfilDetalle = { id: 'p1', codigo: 'ENCARGADO', nombre: 'Encargado', predefinido: false, roles: ['r1', 'r2'] };
const LISTADO: PerfilListado[] = [{ id: 'p1', codigo: 'ENCARGADO', nombre: 'Encargado', predefinido: false, totalRoles: 2, productos: ['ECO', 'LIB'] }];

const lecturaPerfiles: LecturaPerfiles = {
  listar: async () => LISTADO,
  detalle: async (perfilId) => (perfilId === ENCARGADO.id ? ENCARGADO : null),
};

const rol = (codigo: string, productoCodigo: string, predefinido: boolean, permisos: string[], activo = true): RolDetalle => ({
  id: `id-${codigo}`,
  codigo,
  nombre: codigo,
  productoCodigo,
  productoNombre: productoCodigo,
  predefinido,
  activo,
  permisos,
});

const PLAT_PROPIETARIO = rol('PLAT_PROPIETARIO', 'PLAT', true, ['plat.rol.gestionar', 'plat.perfil.gestionar']);
const PLAT_ADMIN_TENANTS = rol('PLAT_ADMIN_TENANTS', 'PLAT', true, ['plat.tenant.crear']);
const LIB_VENDEDOR = rol('LIB_VENDEDOR', 'LIB', true, ['lib.venta.registrar']);
const LIB_RETIRADO = rol('LIB_RETIRADO', 'LIB', false, ['lib.venta.registrar'], false);
const CLI_RECEPCION = rol('CLI_RECEPCION', 'CLI', true, ['cli.cita.registrar']);
const ROLES = [PLAT_PROPIETARIO, PLAT_ADMIN_TENANTS, LIB_VENDEDOR, LIB_RETIRADO, CLI_RECEPCION];

const lecturaRoles: LecturaRoles = {
  listar: async (productos) =>
    ROLES.filter((r) => productos.includes(r.productoCodigo)).map(({ permisos, ...resto }): RolListado => ({ ...resto, totalPermisos: permisos.length })),
  detalle: async (rolId) => ROLES.find((r) => r.id === rolId) ?? null,
  catalogo: async () => [],
  productos: async () => [],
};

const listarRoles = new ListarRoles({
  unidadDeTrabajo,
  lectura: lecturaRoles,
  productos: { vigentes: async () => ['LIB'] },
  catalogo: { permisosDeRolPredefinido: async (codigo) => ROLES.find((r) => r.codigo === codigo && r.predefinido)?.permisos ?? [] },
});

describe('Lecturas de perfiles (spec 16c)', () => {
  it('ListarPerfiles devuelve la lista de la lectura', async () => {
    expect(await new ListarPerfiles({ unidadDeTrabajo, lectura: lecturaPerfiles }).ejecutar()).toEqual(LISTADO);
  });

  it('ConsultarPerfil devuelve el detalle', async () => {
    expect(await new ConsultarPerfil({ unidadDeTrabajo, lectura: lecturaPerfiles }).ejecutar('p1')).toEqual(ENCARGADO);
  });

  it('ConsultarPerfil de un perfil inexistente o de otro tenant da NotFoundError «El perfil no existe»', async () => {
    await expect(new ConsultarPerfil({ unidadDeTrabajo, lectura: lecturaPerfiles }).ejecutar('otro')).rejects.toThrow(new NotFoundError('El perfil no existe'));
  });

  it('ListarRolesDisponibles excluye inactivos, de productos no contratados (TR-CA-035) y PLAT_ADMIN_TENANTS', async () => {
    const codigos = (await new ListarRolesDisponibles(listarRoles).ejecutar()).map((r) => r.codigo);
    expect(codigos).toEqual(['PLAT_PROPIETARIO', 'LIB_VENDEDOR']);
  });
});
