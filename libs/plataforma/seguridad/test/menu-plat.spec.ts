import { readFile } from 'node:fs/promises';
import { AplicarManifiesto } from '../src/application/aplicar-manifiesto.js';
import { ManifiestoRepositorioTypeOrm } from '../src/infrastructure/typeorm/manifiesto.repositorio.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

/** Raíces del menú que arma seg.menu_usuario con el manifiesto PLAT real aplicado. */
describeConDb('Menú del manifiesto PLAT 1.6.0 (spec 17a, PostgreSQL 16)', () => {
  let e: Entorno;

  const idDeRol = async (codigo: string): Promise<string> =>
    (await e.dataSource.query('SELECT id FROM seg.rol WHERE codigo = $1 AND tenant_id IS NULL', [codigo]))[0].id;

  /** Miembro ACTIVO del tenant con el rol dado, alcance TENANT; devuelve las opciones de su menú. */
  async function menuCon(rol: string): Promise<string[]> {
    const tenant = await e.sembrar.tenant();
    const { sucursales } = await e.sembrar.organizacion(tenant);
    const { membresiaId, usuarioId } = await e.sembrar.membresia(tenant, 'ACTIVO', true);
    await e.sembrar.asignacion(tenant, membresiaId, { rolId: await idDeRol(rol) });
    const filas: { codigo: string }[] = await e.en(tenant, () =>
      e.uow.run(() => e.uow.manager.query('SELECT codigo FROM seg.menu_usuario($1, $2, $3, NULL) ORDER BY orden, codigo', [usuarioId, tenant, sucursales[0]])),
    );
    return filas.map((fila) => fila.codigo);
  }

  beforeAll(async () => {
    e = await crearEntorno();
    const plat = JSON.parse(await readFile(new URL('../manifiesto/plat.manifiesto.json', import.meta.url), 'utf8'));
    await new AplicarManifiesto(new ManifiestoRepositorioTypeOrm(e.dataSource, e.ids)).ejecutar(plat);
  });

  afterAll(() => e?.cerrar());

  it('el propietario ve «Organización» con empresas, sucursales y unidades, y no ve «Consola»', async () => {
    const menu = await menuCon('PLAT_PROPIETARIO');

    expect(menu).toEqual(expect.arrayContaining(['plat.organizacion', 'plat.organizacion.empresas', 'plat.organizacion.sucursales', 'plat.organizacion.unidades']));
    expect(menu.filter((codigo) => codigo.startsWith('plat.consola'))).toEqual([]);
  });

  it('el administrador de tenants ve «Consola» con Tenants, y no ve «Organización»', async () => {
    const menu = await menuCon('PLAT_ADMIN_TENANTS');

    expect([...menu].sort()).toEqual(['plat.consola', 'plat.consola.tenants']);
  });
});
