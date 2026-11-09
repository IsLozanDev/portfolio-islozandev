import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { ActualizarFeriado } from '../src/application/feriados/actualizar-feriado.js';
import { CrearFeriado, type CrearFeriadoComando } from '../src/application/feriados/crear-feriado.js';
import { EliminarFeriado } from '../src/application/feriados/eliminar-feriado.js';
import { ListarFeriados, type ListarFeriadosConsulta } from '../src/application/feriados/listar-feriados.js';
import { VersionObsoletaError } from '../src/domain/errores.js';
import { FeriadoDuplicadoError, FeriadoNoEncontradoError, SucursalNoEncontradaError } from '../src/domain/feriados/errores.js';
import { crearEntornoCatalogos, OperadorRequeridoDoble, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

// Ids de la semilla de 01f_cat_feriado.sql.
const ANGAMOS = 'ca700000-0000-0000-00fe-000000000012';
const FIESTAS_PATRIAS = 'ca700000-0000-0000-00fe-000000000008';
const TAMANO_MAXIMO = 100;

describeConDb('Feriados (TR-RF-029, PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  let actorId: string;
  const sucursales = { cusco: uuidV7(), lima: uuidV7(), delOperador: uuidV7() };
  const comoOperador = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.operador, trabajo);
  const comoCliente = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);
  const crear = (comando: Partial<CrearFeriadoComando>) =>
    new CrearFeriado(entorno.feriados).ejecutar({
      alcance: 'TENANT',
      sucursalId: null,
      fecha: '2026-05-15',
      nombre: 'Aniversario',
      recurrenteAnual: false,
      actorId,
      ...comando,
    });
  const listarPagina = (anio: number, cambios: Partial<ListarFeriadosConsulta> = {}) =>
    new ListarFeriados(entorno.feriados).ejecutar({ anio, sucursalId: null, alcance: null, pagina: 1, tamano: TAMANO_MAXIMO, ...cambios });
  const listar = async (anio: number, sucursalId: string | null = null) => (await listarPagina(anio, { sucursalId })).items;

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    actorId = entorno.tenants.usuarioId;
    await sembrarSucursales(entorno, sucursales);
  });

  afterAll(() => entorno?.cerrar());

  it('crea un feriado del tenant con feriado.actualizado en el outbox de la misma transacción', async () => {
    const guardado = await comoCliente(() => crear({ fecha: '2026-05-15' }));
    const [fila] = await entorno.dataSource.query(`SELECT alcance, tenant_id, sucursal_id, version FROM cat.feriado WHERE id = $1`, [guardado.id]);
    expect(fila).toEqual({ alcance: 'TENANT', tenant_id: entorno.tenants.cliente, sucursal_id: null, version: '0' });
    const [evento] = await entorno.eventosDe(guardado.id);
    expect(evento).toMatchObject({ tenant_id: entorno.tenants.cliente, event_type: 'feriado.actualizado', aggregate_type: 'feriado', version: '0' });
    expect(evento.payload).toEqual({
      feriado_id: guardado.id,
      accion: 'CREADO',
      alcance: 'TENANT',
      tenant_id: entorno.tenants.cliente,
      sucursal_id: null,
      fecha: '2026-05-15',
      nombre: 'Aniversario',
      recurrente_anual: false,
      version: 0,
      por: actorId,
    });
  });

  it('TR-CA-077: el 2026-10-08 en un tenant choca con el global recurrente y no deja fila ni evento', async () => {
    const [{ total: antes }] = await entorno.dataSource.query(`SELECT count(*)::int AS total FROM sync.outbox`);
    await expect(comoCliente(() => crear({ fecha: '2026-10-08', nombre: 'Feriado repetido' }))).rejects.toThrow(FeriadoDuplicadoError);
    const [{ total: despues }] = await entorno.dataSource.query(`SELECT count(*)::int AS total FROM sync.outbox`);
    expect(despues).toBe(antes);
    expect(await entorno.dataSource.query(`SELECT 1 FROM cat.feriado WHERE nombre = 'Feriado repetido'`)).toEqual([]);
  });

  it('un global fuera del operador da 403; editarlo o borrarlo desde un tenant da 404', async () => {
    await expect(comoCliente(() => crear({ alcance: 'GLOBAL', fecha: '2027-04-01' }))).rejects.toThrow(OperadorRequeridoDoble);
    await expect(
      comoCliente(() =>
        new ActualizarFeriado(entorno.feriados).ejecutar({
          feriadoId: ANGAMOS,
          fecha: '2026-10-08',
          nombre: 'Angamos',
          recurrenteAnual: true,
          version: 0,
          actorId,
        }),
      ),
    ).rejects.toThrow(FeriadoNoEncontradoError);
    await expect(comoCliente(() => new EliminarFeriado(entorno.feriados).ejecutar({ feriadoId: ANGAMOS, version: 0, actorId }))).rejects.toThrow(
      FeriadoNoEncontradoError,
    );
  });

  it('el operador crea, edita y borra un global con las funciones DEFINER; el evento va con su tenant', async () => {
    const guardado = await comoOperador(() => crear({ alcance: 'GLOBAL', fecha: '2028-04-13', nombre: 'Jueves Santo' }));
    const actualizado = await comoOperador(() =>
      new ActualizarFeriado(entorno.feriados).ejecutar({
        feriadoId: guardado.id,
        fecha: '2028-04-13',
        nombre: 'Jueves Santo 2028',
        recurrenteAnual: false,
        version: 0,
        actorId,
      }),
    );
    expect(actualizado).toMatchObject({ version: 1, cambiado: true });
    await expect(comoOperador(() => new EliminarFeriado(entorno.feriados).ejecutar({ feriadoId: guardado.id, version: 0, actorId }))).rejects.toThrow(
      VersionObsoletaError,
    );
    await comoOperador(() => new EliminarFeriado(entorno.feriados).ejecutar({ feriadoId: guardado.id, version: 1, actorId }));
    expect(await entorno.dataSource.query(`SELECT 1 FROM cat.feriado WHERE id = $1`, [guardado.id])).toEqual([]);
    const eventos = await entorno.eventosDe(guardado.id);
    expect(eventos.map((evento) => [evento.tenant_id, (evento.payload as { accion: string }).accion, evento.version])).toEqual([
      [entorno.tenants.operador, 'CREADO', '0'],
      [entorno.tenants.operador, 'MODIFICADO', '1'],
      [entorno.tenants.operador, 'ELIMINADO', '1'],
    ]);
    expect(eventos[0].payload).toMatchObject({ alcance: 'GLOBAL', tenant_id: null });
  });

  it('un PUT sin cambios responde cambiado false y no genera evento; con versión obsoleta da 409', async () => {
    const { id } = await comoCliente(() => crear({ fecha: '2026-09-15', nombre: 'Día de la clínica' }));
    const actualizar = (version: number, fecha = '2026-09-15') =>
      comoCliente(() => new ActualizarFeriado(entorno.feriados).ejecutar({ feriadoId: id, fecha, nombre: 'Día de la clínica', recurrenteAnual: false, version, actorId }));
    await expect(actualizar(0)).resolves.toMatchObject({ cambiado: false, version: 0 });
    expect(await entorno.eventosDe(id)).toHaveLength(1);
    await expect(actualizar(4, '2026-09-16')).rejects.toThrow(VersionObsoletaError);
  });

  it('una sucursal de otro tenant da 404 SUCURSAL_NO_ENCONTRADA', async () => {
    await expect(comoCliente(() => crear({ alcance: 'SUCURSAL', sucursalId: sucursales.delOperador, fecha: '2026-03-03' }))).rejects.toThrow(
      SucursalNoEncontradaError,
    );
  });

  it('TR-CA-076: el feriado de Cusco solo está en la lista de Cusco', async () => {
    await comoCliente(() => crear({ alcance: 'SUCURSAL', sucursalId: sucursales.cusco, fecha: '2026-06-24', nombre: 'Inti Raymi' }));
    const nombres = async (sucursalId: string) => (await comoCliente(() => listar(2026, sucursalId))).map((feriado) => feriado.nombre);
    expect(await nombres(sucursales.cusco)).toContain('Inti Raymi');
    expect(await nombres(sucursales.lima)).not.toContain('Inti Raymi');
    await expect(comoCliente(() => crear({ alcance: 'SUCURSAL', sucursalId: sucursales.cusco, fecha: '2026-06-24', nombre: 'Otra vez' }))).rejects.toThrow(
      FeriadoDuplicadoError,
    );
  });

  it('la lista de 2027 trae Fiestas Patrias en 2027-07-28 con editable false para un tenant, ordenada por fecha', async () => {
    const lista = await comoCliente(() => listar(2027));
    const fiestasPatrias = lista.find((feriado) => feriado.id === FIESTAS_PATRIAS);
    expect(fiestasPatrias).toMatchObject({ fecha: '2026-07-28', fechaEnAnio: '2027-07-28', editable: false, alcance: 'GLOBAL' });
    const fechas = lista.map((feriado) => feriado.fechaEnAnio);
    expect(fechas).toEqual([...fechas].sort());
    expect(fechas).toEqual(expect.arrayContaining(['2027-01-01', '2027-03-25', '2027-03-26', '2027-12-25']));
    expect(fechas).not.toContain('2026-04-02');
    expect((await comoOperador(() => listar(2027))).find((feriado) => feriado.id === FIESTAS_PATRIAS)?.editable).toBe(true);
  });

  it('2027 con tamano=5 trae 5 filas y el total real; alcance=GLOBAL solo globales', async () => {
    const todos = await comoCliente(() => listar(2027));
    const pagina = await comoCliente(() => listarPagina(2027, { tamano: 5 }));
    expect(pagina.items).toEqual(todos.slice(0, 5));
    expect(pagina.total).toBe(todos.length);
    const globales = await comoCliente(() => listarPagina(2027, { alcance: 'GLOBAL' }));
    expect(globales.items.every((feriado) => feriado.alcance === 'GLOBAL')).toBe(true);
  });

  it('un tenant no ve ni borra los feriados de otro', async () => {
    const { id } = await comoCliente(() => crear({ fecha: '2026-11-20', nombre: 'Propio del cliente' }));
    expect((await comoOperador(() => listar(2026))).map((feriado) => feriado.id)).not.toContain(id);
    await expect(comoOperador(() => new EliminarFeriado(entorno.feriados).ejecutar({ feriadoId: id, version: 0, actorId }))).rejects.toThrow(
      FeriadoNoEncontradoError,
    );
  });
});

/** Como superusuario: una empresa por tenant, Cusco y Lima del cliente y una sucursal del operador. */
async function sembrarSucursales(
  entorno: EntornoCatalogos,
  sucursales: { cusco: string; lima: string; delOperador: string },
): Promise<void> {
  const { operador, cliente } = entorno.tenants;
  const empresaCliente = uuidV7();
  const empresaOperador = uuidV7();
  await entorno.dataSource.query(
    `INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES
       ($1, $2, '20600000001', 'Clínica', 1), ($3, $4, '20600000002', 'Plataforma', 1)`,
    [empresaCliente, cliente, empresaOperador, operador],
  );
  await entorno.dataSource.query(
    `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, version) VALUES
       ($1, $4, $5, 'CUS', 'Cusco', 1), ($2, $4, $5, 'LIM', 'Lima', 1), ($3, $6, $7, 'PRI', 'Principal', 1)`,
    [sucursales.cusco, sucursales.lima, sucursales.delOperador, cliente, empresaCliente, operador, empresaOperador],
  );
}
