import { ConflictError, NotFoundError } from '@vitrina/plataforma/kernel';
import { CambiarRolesPerfil, CrearPerfil } from '../src/application/perfil.casos-de-uso.js';
import { CambiarPermisosRol, CopiarRol, CrearRol, InactivarRol } from '../src/application/rol.casos-de-uso.js';
import { PermisoAjenoAlProductoError, ProductoNoContratadoError, RolPredefinidoNoEditableError } from '../src/domain/errores.js';
import { RolRepositorioTypeOrm } from '../src/infrastructure/typeorm/rol.repositorio.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

describeConDb('Casos de uso de rol y perfil (PostgreSQL 16)', () => {
  let e: Entorno;
  let tenant: string;
  let REST_MOZO: string;
  let REST_CAJERO: string;

  const crearRol = () => new CrearRol(e.uow, e.contexto, e.ids, e.eventos, e.repos);
  const copiarRol = () => new CopiarRol(e.uow, e.contexto, e.ids, e.eventos, e.repos);
  const cambiarPermisos = () => new CambiarPermisosRol(e.uow, e.eventos, e.repos);
  const inactivar = () => new InactivarRol(e.uow, e.eventos, e.repos.roles);
  const crearPerfil = () => new CrearPerfil(e.uow, e.contexto, e.ids, e.eventos, e.repos);
  const cambiarRoles = () => new CambiarRolesPerfil(e.uow, e.eventos, e.repos);

  const permisosDe = async (rolId: string) =>
    (await e.dataSource.query('SELECT permiso_codigo FROM seg.rol_permiso WHERE rol_id = $1 ORDER BY 1', [rolId])).map((f: { permiso_codigo: string }) => f.permiso_codigo);
  const filaRol = async (rolId: string) => (await e.dataSource.query('SELECT tenant_id, codigo, nombre, activo, version FROM seg.rol WHERE id = $1', [rolId]))[0];
  const outboxDelTenant = async (t: string) => Number((await e.dataSource.query('SELECT count(*) AS n FROM sync.outbox WHERE tenant_id = $1', [t]))[0].n);

  beforeAll(async () => {
    e = await crearEntorno();
    for (const p of ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver', 'rest.caja.cerrar', 'gym.acceso.registrar', 'plat.rol.gestionar', 'lib.venta.registrar', 'eco.pedido.gestionar', 'cli.cita.registrar']) {
      await e.sembrar.permiso(p);
    }
    await e.sembrar.permiso('rest.retirado.ver', { obsoleto: true });
    REST_MOZO = await e.sembrar.rol(null, 'REST', 'REST_MOZO', ['rest.pedido.tomar', 'rest.pedido.anular', 'rest.mesa.ver']);
    REST_CAJERO = await e.sembrar.rol(null, 'REST', 'REST_CAJERO', ['rest.caja.cerrar']);
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    await e.sembrar.suscripcion(tenant, 'GYM', 'VENCIDA');
  });

  afterAll(() => e?.cerrar());

  describe('CrearRol (TR-RF-011)', () => {
    it('crea el rol del tenant, sus permisos y rol.creado en el outbox con la misma versión', async () => {
      const { rolId } = await e.en(tenant, () =>
        crearRol().ejecutar({ productoCodigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', permisos: ['rest.pedido.tomar', 'rest.mesa.ver'] }),
      );

      expect(await filaRol(rolId)).toEqual({ tenant_id: tenant, codigo: 'MOZO_BARRA', nombre: 'Mozo de barra', activo: true, version: '1' });
      expect(await permisosDe(rolId)).toEqual(['rest.mesa.ver', 'rest.pedido.tomar']);
      expect(await e.eventosDe(rolId)).toEqual([['rol.creado', 1]]);
    });

    it('un producto sin suscripción vigente se rechaza y no deja filas ni eventos', async () => {
      const antes = await outboxDelTenant(tenant);
      await expect(
        e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'GYM', codigo: 'RECEPCION', nombre: 'Recepción', permisos: ['gym.acceso.registrar'] })),
      ).rejects.toThrow(ProductoNoContratadoError);
      expect((await e.dataSource.query("SELECT count(*)::int AS n FROM seg.rol WHERE codigo = 'RECEPCION'"))[0].n).toBe(0);
      expect(await outboxDelTenant(tenant)).toBe(antes);
    });

    it('los roles PLAT no exigen suscripción', async () => {
      const { rolId } = await e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'PLAT', codigo: 'ADMIN_ROLES', nombre: 'Admin de roles', permisos: ['plat.rol.gestionar'] }));
      expect(await permisosDe(rolId)).toEqual(['plat.rol.gestionar']);
    });

    it('rechaza permisos de otro producto u obsoletos y códigos repetidos en el tenant', async () => {
      await expect(
        e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'REST', codigo: 'MIXTO', nombre: 'Mixto', permisos: ['gym.acceso.registrar', 'rest.retirado.ver'] })),
      ).rejects.toThrow(PermisoAjenoAlProductoError);
      await expect(
        e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'REST', codigo: 'MOZO_BARRA', nombre: 'Otro', permisos: [] })),
      ).rejects.toThrow(new ConflictError('Ya existe un rol con ese código en el tenant'));
    });
  });

  describe('CopiarRol y CambiarPermisosRol', () => {
    it('TR-CA-031: «Mozo terraza» copiado de REST_MOZO, sin rest.pedido.anular', async () => {
      const { rolId } = await e.en(tenant, () =>
        copiarRol().ejecutar({ origenId: REST_MOZO, codigo: 'MOZO_TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.pedido.tomar', 'rest.mesa.ver'] }),
      );

      expect(await filaRol(rolId)).toMatchObject({ tenant_id: tenant, nombre: 'Mozo terraza', activo: true, version: '2' });
      expect(await permisosDe(rolId)).toEqual(['rest.mesa.ver', 'rest.pedido.tomar']);
      expect(await permisosDe(REST_MOZO)).toContain('rest.pedido.anular');
      expect(await e.eventosDe(rolId)).toEqual([
        ['rol.creado', 1],
        ['rol.permisos_cambiados', 2],
      ]);
    });

    it('TR-CA-032: quitar un permiso a REST_CAJERO falla con el mensaje del SRS', async () => {
      await expect(e.en(tenant, () => cambiarPermisos().ejecutar({ rolId: REST_CAJERO, permisos: [] }))).rejects.toThrow(
        new RolPredefinidoNoEditableError(),
      );
      expect(await permisosDe(REST_CAJERO)).toEqual(['rest.caja.cerrar']);
    });

    it('cambiar permisos de un rol propio reemplaza las filas y sube la versión', async () => {
      const { rolId } = await e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'REST', codigo: 'CAJERO_T', nombre: 'Cajero', permisos: ['rest.caja.cerrar'] }));
      await e.en(tenant, () => cambiarPermisos().ejecutar({ rolId, permisos: ['rest.mesa.ver', 'rest.pedido.tomar'] }));

      expect(await permisosDe(rolId)).toEqual(['rest.mesa.ver', 'rest.pedido.tomar']);
      expect((await filaRol(rolId)).version).toBe('2');
      expect(await e.eventosDe(rolId)).toEqual([
        ['rol.creado', 1],
        ['rol.permisos_cambiados', 2],
      ]);
    });

    it('dos ediciones sobre la misma versión: la segunda falla por bloqueo optimista', async () => {
      const { rolId } = await e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'REST', codigo: 'CONCURRENTE', nombre: 'Concurrente', permisos: [] }));
      const rolesB = new RolRepositorioTypeOrm(e.uow, e.contexto);
      await e.en(tenant, () =>
        e.uow.run(async () => {
          const a = await e.repos.roles.buscar(rolId);
          const b = await rolesB.buscar(rolId);
          if (!a || !b) throw new Error('el rol debía existir');
          a.cambiarPermisos(['rest.mesa.ver'], await e.repos.catalogo.permisos(['rest.mesa.ver']));
          b.cambiarPermisos(['rest.caja.cerrar'], await e.repos.catalogo.permisos(['rest.caja.cerrar']));
          await e.repos.roles.guardar(a);
          await expect(rolesB.guardar(b)).rejects.toThrow(ConflictError);
        }),
      );
    });

    it('un rol de otro tenant no se ve ni se copia', async () => {
      const otro = await e.sembrar.tenant();
      const ajeno = await e.sembrar.rol(otro, 'REST', 'AJENO', ['rest.mesa.ver']);
      await expect(e.en(tenant, () => copiarRol().ejecutar({ origenId: ajeno, codigo: 'COPIA', nombre: 'Copia' }))).rejects.toThrow(NotFoundError);
      expect(await e.en(tenant, () => e.uow.run(() => e.repos.roles.buscarPorCodigo('AJENO')))).toBeNull();
      expect((await e.en(tenant, () => e.uow.run(() => e.repos.roles.buscarPorCodigo('REST_MOZO'))))?.id).toBe(REST_MOZO);
    });
  });

  describe('InactivarRol (TR-CA-033)', () => {
    it('sin confirmar informa 4 afectados y no cambia nada; confirmado, lo inactiva', async () => {
      const { rolId } = await e.en(tenant, () => crearRol().ejecutar({ productoCodigo: 'REST', codigo: 'TERRAZA', nombre: 'Mozo terraza', permisos: ['rest.mesa.ver'] }));
      const perfilId = await e.sembrar.perfil(tenant, 'PERFIL_TERRAZA', [rolId]);
      for (let i = 0; i < 3; i++) {
        const { membresiaId } = await e.sembrar.membresia(tenant);
        await e.sembrar.asignacion(tenant, membresiaId, { rolId });
        if (i === 0) await e.sembrar.asignacion(tenant, membresiaId, { perfilId }); // la misma membresía cuenta una vez
      }
      const porPerfil = await e.sembrar.membresia(tenant);
      await e.sembrar.asignacion(tenant, porPerfil.membresiaId, { perfilId });
      const vencida = await e.sembrar.membresia(tenant);
      await e.sembrar.asignacion(tenant, vencida.membresiaId, { rolId }, { desde: '2026-01-01', hasta: '2026-01-31' });

      expect(await e.en(tenant, () => inactivar().ejecutar({ rolId, confirmado: false }))).toEqual({ requiereConfirmacion: true, afectados: 4 });
      expect((await filaRol(rolId)).activo).toBe(true);

      expect(await e.en(tenant, () => inactivar().ejecutar({ rolId, confirmado: true }))).toEqual({ requiereConfirmacion: false, afectados: 4 });
      expect((await filaRol(rolId)).activo).toBe(false);
      const [{ payload }] = await e.dataSource.query("SELECT payload FROM sync.outbox WHERE aggregate_id = $1 AND event_type = 'rol.inactivado'", [rolId]);
      expect(payload).toEqual({ afectados: 4 });
    });

    it('un rol predefinido no se inactiva', async () => {
      await expect(e.en(tenant, () => inactivar().ejecutar({ rolId: REST_CAJERO, confirmado: false }))).rejects.toThrow(RolPredefinidoNoEditableError);
    });
  });

  describe('Perfiles (TR-RF-012)', () => {
    let tienda: string;
    let LIB_VENDEDOR: string;
    let ECO_GESTOR: string;
    let CLI_RECEPCION: string;

    beforeAll(async () => {
      tienda = await e.sembrar.tenant();
      await e.sembrar.suscripcion(tienda, 'LIB');
      await e.sembrar.suscripcion(tienda, 'ECO', 'PRUEBA');
      LIB_VENDEDOR = await e.sembrar.rol(null, 'LIB', 'LIB_VENDEDOR', ['lib.venta.registrar']);
      ECO_GESTOR = await e.sembrar.rol(null, 'ECO', 'ECO_GESTOR_PEDIDOS', ['eco.pedido.gestionar']);
      CLI_RECEPCION = await e.sembrar.rol(null, 'CLI', 'CLI_RECEPCION', ['cli.cita.registrar']);
    });

    it('TR-CA-034: «Encargado de tienda» con LIB_VENDEDOR y ECO_GESTOR_PEDIDOS', async () => {
      const { perfilId } = await e.en(tienda, () => crearPerfil().ejecutar({ codigo: 'ENCARGADO', nombre: 'Encargado de tienda', roles: [LIB_VENDEDOR, ECO_GESTOR] }));

      const roles = (await e.dataSource.query('SELECT rol_id FROM seg.perfil_rol WHERE perfil_id = $1 ORDER BY 1', [perfilId])).map((f: { rol_id: string }) => f.rol_id);
      expect(roles).toEqual([LIB_VENDEDOR, ECO_GESTOR].sort());
      expect(await e.eventosDe(perfilId)).toEqual([['perfil.creado', 1]]);
    });

    it('TR-CA-035: CLI_RECEPCION sin CLI contratado se rechaza sin dejar filas', async () => {
      const antes = await outboxDelTenant(tienda);
      await expect(e.en(tienda, () => crearPerfil().ejecutar({ codigo: 'RECEPCION', nombre: 'Recepción', roles: [LIB_VENDEDOR, CLI_RECEPCION] }))).rejects.toThrow(
        new ProductoNoContratadoError('CLI'),
      );
      expect((await e.dataSource.query("SELECT count(*)::int AS n FROM seg.perfil WHERE codigo = 'RECEPCION'"))[0].n).toBe(0);
      expect(await outboxDelTenant(tienda)).toBe(antes);
    });

    it('un rol inexistente da NotFoundError', async () => {
      await expect(e.en(tienda, () => crearPerfil().ejecutar({ codigo: 'FANTASMA', nombre: 'Fantasma', roles: ['0193f3a0-0000-7000-8000-00000000dead'] }))).rejects.toThrow(
        NotFoundError,
      );
    });

    it('CambiarRolesPerfil reemplaza los roles y publica la diferencia', async () => {
      const { perfilId } = await e.en(tienda, () => crearPerfil().ejecutar({ codigo: 'VENDEDOR', nombre: 'Vendedor', roles: [LIB_VENDEDOR] }));
      await e.en(tienda, () => cambiarRoles().ejecutar({ perfilId, roles: [ECO_GESTOR] }));

      expect((await e.dataSource.query('SELECT rol_id FROM seg.perfil_rol WHERE perfil_id = $1', [perfilId])).map((f: { rol_id: string }) => f.rol_id)).toEqual([ECO_GESTOR]);
      expect(await e.eventosDe(perfilId)).toEqual([
        ['perfil.creado', 1],
        ['perfil.roles_cambiados', 2],
      ]);
      const [{ payload }] = await e.dataSource.query("SELECT payload FROM sync.outbox WHERE aggregate_id = $1 AND event_type = 'perfil.roles_cambiados'", [perfilId]);
      expect(payload).toEqual({ agregados: [ECO_GESTOR], quitados: [LIB_VENDEDOR] });
    });
  });
});
