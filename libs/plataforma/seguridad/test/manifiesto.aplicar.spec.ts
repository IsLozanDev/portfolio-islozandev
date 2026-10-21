import { readFile } from 'node:fs/promises';
import { AplicarManifiesto } from '../src/application/aplicar-manifiesto.js';
import { ManifiestoInvalidoError, ManifiestoVersionAlteradaError } from '../src/domain/errores.js';
import { ManifiestoRepositorioTypeOrm } from '../src/infrastructure/typeorm/manifiesto.repositorio.js';
import { crearEntorno, type Entorno } from './support/entorno.js';

type Json = Record<string, unknown>;

const rest = (version: string, cambios: (m: Json) => void = () => undefined): Json => {
  const m: Json = {
    producto_codigo: 'REST',
    nombre: 'Restaurantes',
    version,
    modulos: [{ codigo: 'caja', nombre: 'Caja', orden: 1 }],
    opciones: [
      { codigo: 'rest.caja', modulo: 'caja', padre: null, nombre: 'Caja', orden: 1, permisos: [] },
      { codigo: 'rest.caja.cierre', modulo: 'caja', padre: 'rest.caja', nombre: 'Cierre', ruta: '/caja/cierre', permisos: ['rest.caja.cerrar'] },
    ],
    permisos: [
      { codigo: 'rest.caja.cerrar', descripcion: 'Cerrar caja', alcance_minimo: 'UNIDAD', sensible: false },
      { codigo: 'rest.pedido.anular', descripcion: 'Anular pedido', alcance_minimo: 'UNIDAD', sensible: true },
    ],
    roles_predefinidos: [{ codigo: 'REST_CAJERO', nombre: 'Cajero', permisos: ['rest.caja.cerrar', 'rest.pedido.anular'] }],
  };
  cambios(m);
  return m;
};

describe('AplicarManifiesto (TR-RF-008, PostgreSQL 16)', () => {
  let e: Entorno;
  let aplicar: AplicarManifiesto;
  const uno = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> => (await e.dataSource.query(sql, params))[0];
  const contar = async (sql: string, params: unknown[] = []) => Number((await uno<{ n: string }>(sql, params)).n);

  beforeAll(async () => {
    e = await crearEntorno();
    aplicar = new AplicarManifiesto(new ManifiestoRepositorioTypeOrm(e.dataSource, e.ids));
  });

  afterAll(() => e?.cerrar());

  it('el manifiesto PLAT se aplica y la segunda vez reporta 0 cambios', async () => {
    const plat = JSON.parse(await readFile(new URL('../manifiesto/plat.manifiesto.json', import.meta.url), 'utf8'));

    const primera = await aplicar.ejecutar(plat);
    expect(primera).toMatchObject({ producto: 'PLAT', version: '1.0.0', yaAplicado: false });
    expect(primera.cambios.permisos.insertados).toBe(6);
    const filas = await contar("SELECT count(*) AS n FROM seg.manifiesto_aplicado WHERE producto_codigo = 'PLAT'");

    const segunda = await aplicar.ejecutar(plat);
    expect(segunda).toMatchObject({ yaAplicado: true, total: 0 });
    expect(await contar("SELECT count(*) AS n FROM seg.manifiesto_aplicado WHERE producto_codigo = 'PLAT'")).toBe(filas);
    expect(await uno("SELECT sensible FROM seg.permiso WHERE codigo = 'plat.asignacion.otorgar'")).toEqual({ sensible: true });
  });

  it('TR-CA-022: con REST en 1.4.0, aplicar 1.5.0 registra rest.propina.configurar y la versión 1.5.0', async () => {
    await aplicar.ejecutar(rest('1.4.0'));
    const r = await aplicar.ejecutar(
      rest('1.5.0', (m) => (m.permisos as Json[]).push({ codigo: 'rest.propina.configurar', descripcion: 'Configurar propina', alcance_minimo: 'SUCURSAL' })),
    );

    expect(r).toMatchObject({ version: '1.5.0', total: 1 });
    expect(await uno("SELECT producto_codigo, obsoleto FROM seg.permiso WHERE codigo = 'rest.propina.configurar'")).toEqual({ producto_codigo: 'REST', obsoleto: false });
    expect(await uno("SELECT version FROM seg.manifiesto_aplicado WHERE producto_codigo = 'REST' ORDER BY id DESC LIMIT 1")).toEqual({ version: '1.5.0' });
  });

  it('TR-CA-023: aplicar otra vez 1.5.0 da 0 cambios y no agrega filas', async () => {
    const m = rest('1.5.0', (x) => (x.permisos as Json[]).push({ codigo: 'rest.propina.configurar', descripcion: 'Configurar propina', alcance_minimo: 'SUCURSAL' }));
    const antes = await contar('SELECT count(*) AS n FROM seg.manifiesto_aplicado');
    expect(await aplicar.ejecutar(m)).toMatchObject({ yaAplicado: true, total: 0 });
    expect(await contar('SELECT count(*) AS n FROM seg.manifiesto_aplicado')).toBe(antes);
  });

  it('la misma versión con otro contenido se rechaza', async () => {
    await expect(aplicar.ejecutar(rest('1.5.0'))).rejects.toThrow(ManifiestoVersionAlteradaError);
  });

  it('TR-CA-024: un permiso mal formado no escribe nada y nombra el permiso', async () => {
    const antes = await contar('SELECT count(*) AS n FROM seg.permiso');
    const malo = rest('1.6.0', (m) => (m.permisos as Json[]).push({ codigo: 'rest-caja-cerrar', descripcion: 'Mal', alcance_minimo: 'SUCURSAL' }));
    await expect(aplicar.ejecutar(malo)).rejects.toThrow(ManifiestoInvalidoError);
    await expect(aplicar.ejecutar(malo)).rejects.toThrow('permisos[2].codigo: rest-caja-cerrar');
    expect(await contar('SELECT count(*) AS n FROM seg.permiso')).toBe(antes);
    expect(await uno("SELECT version FROM seg.manifiesto_aplicado WHERE producto_codigo = 'REST' ORDER BY id DESC LIMIT 1")).toEqual({ version: '1.5.0' });
  });

  it('deja opciones con padre y permisos, y el rol predefinido no editable', async () => {
    expect(
      await uno(`SELECT p.codigo AS padre, ARRAY(SELECT permiso_codigo::text FROM seg.opcion_permiso WHERE opcion_id = o.id) AS permisos
                   FROM seg.opcion o JOIN seg.opcion p ON p.id = o.padre_id WHERE o.codigo = 'rest.caja.cierre'`),
    ).toEqual({ padre: 'rest.caja', permisos: ['rest.caja.cerrar'] });
    expect(await uno("SELECT tenant_id, editable FROM seg.rol WHERE codigo = 'REST_CAJERO'")).toEqual({ tenant_id: null, editable: false });
  });

  it('retirar un permiso lo deja obsoleto, fuera de permisos_efectivos, y sube la versión de catálogo', async () => {
    const tenant = await e.sembrar.tenant();
    await e.sembrar.suscripcion(tenant, 'REST');
    const [{ id: sucursal }] = await e.dataSource.query(
      `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES (gen_random_uuid(), $1, '20999999991', 'Empresa', 1) RETURNING id`,
      [tenant],
    ).then(async ([empresa]: { id: string }[]) =>
      e.dataSource.query(
        `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, codigo_establecimiento_sunat, es_principal, version)
         VALUES (gen_random_uuid(), $1, $2, 'PRINCIPAL', 'Principal', '0000', true, 1) RETURNING id`,
        [tenant, empresa.id],
      ),
    );
    const { membresiaId, usuarioId } = await e.sembrar.membresia(tenant);
    const cajero = (await uno<{ id: string }>("SELECT id FROM seg.rol WHERE codigo = 'REST_CAJERO' AND tenant_id IS NULL")).id;
    await e.sembrar.asignacion(tenant, membresiaId, { rolId: cajero }, { desde: '2026-01-01' });
    const efectivos = async () =>
      e.dataSource.transaction(async (m) => {
        await m.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
        return (await m.query('SELECT permiso_codigo FROM seg.permisos_efectivos($1, $2, $3) ORDER BY 1', [usuarioId, tenant, sucursal])).map(
          (f: { permiso_codigo: string }) => f.permiso_codigo,
        );
      });
    expect(await efectivos()).toEqual(['rest.caja.cerrar', 'rest.pedido.anular']);
    const vc = await contar('SELECT max(id) AS n FROM seg.manifiesto_aplicado');

    const r = await aplicar.ejecutar(
      rest('1.6.0', (m) => {
        m.permisos = (m.permisos as Json[]).filter((p) => p.codigo !== 'rest.pedido.anular');
        (m.roles_predefinidos as Json[])[0].permisos = ['rest.caja.cerrar'];
      }),
    );

    expect(r.cambios.permisos).toEqual({ insertados: 0, actualizados: 0, obsoletos: 2 });
    expect(await uno("SELECT obsoleto FROM seg.permiso WHERE codigo = 'rest.pedido.anular'")).toEqual({ obsoleto: true });
    expect(await efectivos()).toEqual(['rest.caja.cerrar']);
    expect(await contar('SELECT max(id) AS n FROM seg.manifiesto_aplicado')).toBeGreaterThan(vc);
  });

  it('TR-RNF-120: un manifiesto de 200 permisos se aplica en menos de 30 s', async () => {
    const permisos = Array.from({ length: 200 }, (_, i) => ({ codigo: `gym.recurso${i}.ver`, descripcion: `Permiso ${i}`, alcance_minimo: 'SUCURSAL' }));
    const m = { producto_codigo: 'GYM', nombre: 'Gimnasios', version: '1.0.0', modulos: [], opciones: [], permisos, roles_predefinidos: [{ codigo: 'GYM_TODO', nombre: 'Todo', permisos: permisos.map((p) => p.codigo) }] };

    const inicio = performance.now();
    const r = await aplicar.ejecutar(m);
    const ms = performance.now() - inicio;

    expect(r.cambios.permisos.insertados).toBe(200);
    expect(ms).toBeLessThan(30_000);
    expect(await aplicar.ejecutar(m)).toMatchObject({ yaAplicado: true, total: 0 });
  });
});
