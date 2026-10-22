import type { Redis } from 'ioredis';
import type { ConsultaPermisos, PermisosRepositorio } from '../src/application/ports/permisos.port.js';
import { clavePermisos, ResolverPermisos } from '../src/application/resolver-permisos.js';
import { SucursalNoAsignadaError } from '../src/domain/errores.js';
import { CachePermisosRedis, crearClienteRedis } from '../src/infrastructure/redis/cache-permisos.redis.js';
import { PermisosSqlRepositorio } from '../src/infrastructure/typeorm/permisos.sql.repositorio.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/** Cuenta cuántas veces se calcula desde la base: un acierto de caché no llama a efectivos. */
function contando(repo: PermisosRepositorio) {
  const llamadas = { efectivos: 0 };
  const envuelto: PermisosRepositorio = {
    versiones: (t) => repo.versiones(t),
    efectivos: (c) => (llamadas.efectivos++, repo.efectivos(c)),
    menu: (c) => repo.menu(c),
    sucursalesAccesibles: (u, t) => repo.sucursalesAccesibles(u, t),
  };
  return { envuelto, llamadas };
}

describeConDb('ResolverPermisos con Redis 7 y PostgreSQL 16 (TR-RF-015, TR-RNF-101)', () => {
  let e: Entorno;
  let redis: Redis;
  let tenant: string;
  let org: { empresaId: string; sucursales: [string, string]; cajas: [string, string] };
  let maria: { membresiaId: string; usuarioId: string };
  let SUPERVISOR: string;
  let suscripcionRest: string;
  let repo: ReturnType<typeof contando>;
  let resolver: ResolverPermisos;
  const avisos: string[] = [];

  const consulta = (cambios: Partial<ConsultaPermisos> = {}): ConsultaPermisos => ({
    usuarioId: maria.usuarioId,
    tenantId: tenant,
    sucursalId: org.sucursales[0],
    ...cambios,
  });

  beforeAll(async () => {
    e = await crearEntorno();
    redis = crearClienteRedis(REDIS_URL);
    for (const p of ['rest.caja.abrir', 'rest.caja.cerrar', 'rest.pedido.anular']) await e.sembrar.permiso(p, { alcanceMinimo: 'UNIDAD' });
    tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    [{ id: suscripcionRest }] = await e.dataSource.query("SELECT id FROM org.suscripcion WHERE tenant_id = $1 AND producto_codigo = 'REST'", [tenant]);
    org = await e.sembrar.organizacion(tenant);
    SUPERVISOR = await e.sembrar.rol(tenant, 'REST', 'SUPERVISOR', ['rest.caja.abrir']);
    maria = await e.sembrar.membresia(tenant);
    await e.sembrar.asignacion(tenant, maria.membresiaId, { rolId: SUPERVISOR }, { desde: '2026-01-01' }, { alcance: 'EMPRESA', empresaId: org.empresaId });

    // Menú: carpeta «Caja» con la opción «Apertura» (rest.caja.abrir).
    const [{ id: modulo }] = await e.dataSource.query("INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre) VALUES (gen_random_uuid(), 'REST', 'caja', 'Caja') RETURNING id");
    const [{ id: carpeta }] = await e.dataSource.query(
      "INSERT INTO seg.opcion (id, modulo_id, codigo, nombre, icono, orden) VALUES (gen_random_uuid(), $1, 'rest.caja', 'Caja', 'point_of_sale', 1) RETURNING id",
      [modulo],
    );
    const [{ id: apertura }] = await e.dataSource.query(
      "INSERT INTO seg.opcion (id, modulo_id, padre_id, codigo, nombre, ruta, orden) VALUES (gen_random_uuid(), $1, $2, 'rest.caja.apertura', 'Apertura', '/caja/apertura', 1) RETURNING id",
      [modulo, carpeta],
    );
    await e.dataSource.query("INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) VALUES ($1, 'rest.caja.abrir')", [apertura]);

    repo = contando(new PermisosSqlRepositorio(e.uow, e.contexto));
    resolver = new ResolverPermisos(e.uow, e.contexto, repo.envuelto, new CachePermisosRedis(redis), (m) => avisos.push(m));
  });

  afterAll(async () => {
    if (redis) {
      await new CachePermisosRedis(redis).invalidarTenant(tenant);
      redis.disconnect();
    }
    await e?.cerrar();
  });

  it('TR-CA-041: con alcance EMPRESA, la sucursal de esa empresa da los permisos y el menú con su carpeta', async () => {
    const r = await resolver.ejecutar(consulta());
    expect(r.permisos).toEqual(['rest.caja.abrir']);
    expect(r.menu).toEqual([
      { codigo: 'rest.caja', padre: null, nombre: 'Caja', ruta: null, icono: 'point_of_sale', orden: 1 },
      { codigo: 'rest.caja.apertura', padre: 'rest.caja', nombre: 'Apertura', ruta: '/caja/apertura', icono: null, orden: 1 },
    ]);
  });

  it('la segunda resolución sale de la caché y la unidad entra en la clave', async () => {
    await resolver.ejecutar(consulta());
    const antes = repo.llamadas.efectivos;
    await resolver.ejecutar(consulta());
    expect(repo.llamadas.efectivos).toBe(antes);

    await resolver.ejecutar(consulta({ unidadId: org.cajas[0] }));
    expect(repo.llamadas.efectivos).toBe(antes + 1);
    const claves = await redis.smembers(`perm-idx:${tenant}`);
    expect(claves.some((c) => c.endsWith(`:${org.cajas[0]}`))).toBe(true);
    expect(claves.some((c) => c.endsWith(':-'))).toBe(true);
    expect(await redis.ttl(claves[0])).toBeLessThanOrEqual(60);
  });

  it('una sucursal no accesible da SucursalNoAsignadaError y no se guarda', async () => {
    const otro = await e.sembrar.membresia(tenant);
    await e.sembrar.asignacion(tenant, otro.membresiaId, { rolId: SUPERVISOR }, { desde: '2026-01-01' }, { alcance: 'SUCURSAL', sucursalId: org.sucursales[1] });
    await expect(resolver.ejecutar(consulta({ usuarioId: otro.usuarioId }))).rejects.toThrow(SucursalNoAsignadaError);
  });

  describe('invalidación al commit (≤ 5 s)', () => {
    const tras = async (cambio: () => Promise<unknown>) => {
      await resolver.ejecutar(consulta()); // caché caliente
      await cambio();
      const inicio = performance.now();
      const r = await resolver.ejecutar(consulta());
      return { permisos: r.permisos, ms: performance.now() - inicio };
    };

    it('un permiso nuevo en el rol', async () => {
      const r = await tras(() => e.dataSource.query("INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) VALUES ($1, 'rest.caja.cerrar')", [SUPERVISOR]));
      expect(r.permisos).toEqual(['rest.caja.abrir', 'rest.caja.cerrar']);
      expect(r.ms).toBeLessThan(5000);
    });

    it('una asignación nueva', async () => {
      const ANULADOR = await e.sembrar.rol(tenant, 'REST', 'ANULADOR', ['rest.pedido.anular']);
      const r = await tras(() => e.sembrar.asignacion(tenant, maria.membresiaId, { rolId: ANULADOR }, { desde: '2026-01-01' }));
      expect(r.permisos).toContain('rest.pedido.anular');
    });

    it('la suscripción vencida (TR-CA-042) y reactivada', async () => {
      const vencida = await tras(() => e.dataSource.query("UPDATE org.suscripcion SET estado = 'VENCIDA' WHERE id = $1", [suscripcionRest]));
      expect(vencida.permisos).toEqual([]);
      const activa = await tras(() => e.dataSource.query("UPDATE org.suscripcion SET estado = 'ACTIVA' WHERE id = $1", [suscripcionRest]));
      expect(activa.permisos.length).toBeGreaterThan(0);
    });

    it('la membresía suspendida deja al usuario sin sucursales', async () => {
      try {
        await expect(tras(() => e.dataSource.query("UPDATE seg.membresia SET estado = 'SUSPENDIDO' WHERE id = $1", [maria.membresiaId]))).rejects.toThrow(
          SucursalNoAsignadaError,
        );
      } finally {
        await e.dataSource.query("UPDATE seg.membresia SET estado = 'ACTIVO' WHERE id = $1", [maria.membresiaId]);
      }
      expect((await resolver.ejecutar(consulta())).permisos.length).toBeGreaterThan(0);
    });

    it('la clave cambia con la versión de seguridad', async () => {
      const v = await e.en(tenant, () => e.uow.run(() => repo.envuelto.versiones(tenant)));
      await e.dataSource.query('DELETE FROM seg.rol_permiso WHERE rol_id = $1 AND permiso_codigo = $2', [SUPERVISOR, 'rest.caja.cerrar']);
      const w = await e.en(tenant, () => e.uow.run(() => repo.envuelto.versiones(tenant)));
      expect(w.vt).toBe(v.vt + 1);
      expect(clavePermisos(consulta(), w)).not.toBe(clavePermisos(consulta(), v));
    });
  });

  it('con Redis caído resuelve desde la base y deja un aviso', async () => {
    const caido = crearClienteRedis('redis://127.0.0.1:1');
    const avisosCaido: string[] = [];
    const sinCache = new ResolverPermisos(e.uow, e.contexto, repo.envuelto, new CachePermisosRedis(caido), (m) => avisosCaido.push(m));
    try {
      const r = await sinCache.ejecutar(consulta());
      expect(r.permisos).toContain('rest.caja.abrir');
      expect(avisosCaido).toEqual(['Caché de permisos no disponible; se resuelve desde la base']);
    } finally {
      caido.disconnect();
    }
  });

  it('TR-RNF-101: con caché caliente, el p95 de 1000 resoluciones es menor de 20 ms', async () => {
    await resolver.ejecutar(consulta());
    const tiempos: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const inicio = performance.now();
      await resolver.ejecutar(consulta());
      tiempos.push(performance.now() - inicio);
    }
    tiempos.sort((a, b) => a - b);
    const p95 = tiempos[Math.floor(tiempos.length * 0.95)];
    expect(p95).toBeLessThan(20);
  });
});
