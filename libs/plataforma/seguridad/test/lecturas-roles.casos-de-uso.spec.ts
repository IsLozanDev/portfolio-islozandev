import { NotFoundError, type UnitOfWork } from '@vitrina/plataforma/kernel';
import { ConsultarCatalogo, ConsultarRol, ListarProductosDisponibles, ListarRoles } from '../src/application/lecturas-roles.js';
import type { FilaCatalogo, LecturaRoles, RolDetalle, RolListado } from '../src/application/ports/lectura-roles.js';
import { ProductoNoContratadoError } from '../src/domain/errores.js';

const unidadDeTrabajo: UnitOfWork = { run: (trabajo) => trabajo() };

const rol = (codigo: string, productoCodigo: string, predefinido: boolean, permisos: string[]): RolDetalle => ({
  id: `id-${codigo}`,
  codigo,
  nombre: codigo,
  productoCodigo,
  productoNombre: productoCodigo,
  predefinido,
  activo: true,
  permisos,
});

const PLAT_PROPIETARIO = rol('PLAT_PROPIETARIO', 'PLAT', true, ['plat.rol.gestionar', 'plat.usuario.invitar']);
const PLAT_ADMIN_TENANTS = rol('PLAT_ADMIN_TENANTS', 'PLAT', true, ['plat.tenant.crear']);
const PLAT_ADMIN_SEGURIDAD = rol('PLAT_ADMIN_SEGURIDAD', 'PLAT', true, ['plat.rol.gestionar']);
const PROPIO_PLAT = rol('ADMIN_ROLES', 'PLAT', false, ['plat.rol.gestionar']);
const REST_MOZO = rol('REST_MOZO', 'REST', true, ['rest.pedido.tomar']);
const ROLES = [PLAT_PROPIETARIO, PLAT_ADMIN_TENANTS, PLAT_ADMIN_SEGURIDAD, PROPIO_PLAT, REST_MOZO];

const fila = (codigo: string): FilaCatalogo => ({
  permiso: { codigo, descripcion: codigo, sensible: false, alcanceMinimo: 'TENANT' },
  modulo: null,
  opcion: null,
});

function crearLectura(): LecturaRoles & { productosPedidos: string[][] } {
  const productosPedidos: string[][] = [];
  return {
    productosPedidos,
    listar: async (productos) => {
      productosPedidos.push([...productos]);
      return ROLES.filter((r) => productos.includes(r.productoCodigo)).map(({ permisos, ...resto }): RolListado => ({ ...resto, totalPermisos: permisos.length }));
    },
    detalle: async (rolId) => ROLES.find((r) => r.id === rolId) ?? null,
    catalogo: async (productoCodigo) =>
      productoCodigo === 'PLAT' ? [fila('plat.rol.gestionar'), fila('plat.tenant.crear'), fila('plat.manifiesto.aplicar')] : [fila('rest.pedido.tomar')],
    productos: async (codigos) => codigos.map((codigo) => ({ codigo, nombre: `Producto ${codigo}` })),
  };
}

function dependencias(contratados: string[] = ['REST']) {
  return {
    unidadDeTrabajo,
    lectura: crearLectura(),
    productos: { vigentes: async () => contratados },
    catalogo: { permisosDeRolPredefinido: async (codigo: string) => ROLES.find((r) => r.codigo === codigo && r.predefinido)?.permisos ?? [] },
  };
}

describe('Lecturas de roles (spec 16b)', () => {
  describe('ListarRoles', () => {
    it('pide PLAT y los productos contratados', async () => {
      const deps = dependencias(['REST', 'LIB']);
      await new ListarRoles(deps).ejecutar();
      expect(deps.lectura.productosPedidos).toEqual([['PLAT', 'REST', 'LIB']]);
    });

    it('oculta los predefinidos PLAT con permisos fuera de PLAT_PROPIETARIO, como PLAT_ADMIN_TENANTS', async () => {
      const codigos = (await new ListarRoles(dependencias()).ejecutar()).map((r) => r.codigo);
      expect(codigos).toEqual(['PLAT_PROPIETARIO', 'PLAT_ADMIN_SEGURIDAD', 'ADMIN_ROLES', 'REST_MOZO']);
    });

    it('sin productos contratados no trae roles de esos productos', async () => {
      const codigos = (await new ListarRoles(dependencias([])).ejecutar()).map((r) => r.codigo);
      expect(codigos).not.toContain('REST_MOZO');
    });
  });

  describe('ConsultarRol', () => {
    it('devuelve el detalle', async () => {
      expect(await new ConsultarRol(dependencias()).ejecutar(REST_MOZO.id)).toEqual(REST_MOZO);
    });

    it('un rol inexistente o de otro tenant da NotFoundError «El rol no existe»', async () => {
      await expect(new ConsultarRol(dependencias()).ejecutar('id-AJENO')).rejects.toThrow(new NotFoundError('El rol no existe'));
    });
  });

  describe('ConsultarCatalogo', () => {
    it('PLAT solo trae los permisos de PLAT_PROPIETARIO', async () => {
      const arbol = await new ConsultarCatalogo(dependencias()).ejecutar('PLAT');
      expect(arbol.otros.map((permiso) => permiso.codigo)).toEqual(['plat.rol.gestionar']);
    });

    it('un producto contratado trae su árbol completo', async () => {
      const arbol = await new ConsultarCatalogo(dependencias()).ejecutar('REST');
      expect(arbol).toMatchObject({ productoCodigo: 'REST', otros: [{ codigo: 'rest.pedido.tomar' }] });
    });

    it('un producto no contratado lanza PRODUCTO_NO_CONTRATADO', async () => {
      await expect(new ConsultarCatalogo(dependencias()).ejecutar('GYM')).rejects.toThrow(new ProductoNoContratadoError('GYM'));
    });
  });

  it('ListarProductosDisponibles trae PLAT y los contratados', async () => {
    expect(await new ListarProductosDisponibles(dependencias(['REST'])).ejecutar()).toEqual([
      { codigo: 'PLAT', nombre: 'Producto PLAT' },
      { codigo: 'REST', nombre: 'Producto REST' },
    ]);
  });
});
