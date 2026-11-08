import { performance } from 'node:perf_hooks';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { CrearFeriado } from '../src/application/feriados/crear-feriado.js';
import { EsDiaHabil } from '../src/application/feriados/es-dia-habil.js';
import { SumarDiasHabiles } from '../src/application/feriados/sumar-dias-habiles.js';
import { crearEntornoCatalogos, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const CALCULOS_MEDIDOS = 200;
const DIAS_MEDIDOS = 30;
const PERCENTIL = 0.95;
const P95_MAXIMO_MS = 50;

describeConDb('CalendarioPort (TR-RF-029, PostgreSQL 16)', () => {
  let entorno: EntornoCatalogos;
  const sucursales = { cusco: uuidV7(), lima: uuidV7() };
  const comoCliente = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);
  const sumar = (fecha: string, dias: number, sucursalId?: string) =>
    comoCliente(() => new SumarDiasHabiles(entorno.calendario).sumarDiasHabiles(fecha, dias, sucursalId));
  const esHabil = (fecha: string) => comoCliente(() => new EsDiaHabil(entorno.calendario).esDiaHabil(fecha));

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    const empresa = uuidV7();
    await entorno.dataSource.query(`INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $2, '20700000001', 'Clínica', 1)`, [
      empresa,
      entorno.tenants.cliente,
    ]);
    await entorno.dataSource.query(
      `INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, version) VALUES ($1, $3, $4, 'CUS', 'Cusco', 1), ($2, $3, $4, 'LIM', 'Lima', 1)`,
      [sucursales.cusco, sucursales.lima, entorno.tenants.cliente, empresa],
    );
  });

  afterAll(() => entorno?.cerrar());

  it('TR-CA-075: sumarDiasHabiles(2026-10-07, 3) con la semilla y sabado_habil por defecto da 2026-10-12', async () => {
    await expect(sumar('2026-10-07', 3)).resolves.toBe('2026-10-12');
  });

  it('esDiaHabil(2026-07-28) es false y esDiaHabil(2026-07-27) es true', async () => {
    await expect(esHabil('2026-07-28')).resolves.toBe(false);
    await expect(esHabil('2026-07-27')).resolves.toBe(true);
  });

  it('un recurrente de la semilla aplica en 2027 y no en 2025', async () => {
    await expect(esHabil('2027-07-28')).resolves.toBe(false);
    await expect(esHabil('2025-07-28')).resolves.toBe(true);
  });

  it('TR-CA-076: un feriado de Cusco cambia el cálculo de Cusco y no el de Lima', async () => {
    await comoCliente(() =>
      new CrearFeriado(entorno.feriados).ejecutar({
        alcance: 'SUCURSAL',
        sucursalId: sucursales.cusco,
        fecha: '2026-10-09',
        nombre: 'Feriado de Cusco',
        recurrenteAnual: false,
        actorId: entorno.tenants.usuarioId,
      }),
    );
    await expect(sumar('2026-10-07', 3, sucursales.cusco)).resolves.toBe('2026-10-13');
    await expect(sumar('2026-10-07', 3, sucursales.lima)).resolves.toBe('2026-10-12');
  });

  it('sabado_habil = false en Lima cambia solo el cálculo de Lima', async () => {
    entorno.sabadoHabilPorSucursal.set(sucursales.lima, false);
    try {
      await expect(sumar('2026-10-07', 3, sucursales.lima)).resolves.toBe('2026-10-13');
      await expect(sumar('2026-10-07', 3)).resolves.toBe('2026-10-12');
    } finally {
      entorno.sabadoHabilPorSucursal.clear();
    }
  });

  it(`TR-RNF-002: p95 < ${P95_MAXIMO_MS} ms en ${CALCULOS_MEDIDOS} cálculos con n = ${DIAS_MEDIDOS}`, async () => {
    const duraciones: number[] = [];
    for (let indice = 0; indice < CALCULOS_MEDIDOS; indice += 1) {
      const inicio = performance.now();
      await sumar('2026-07-01', DIAS_MEDIDOS, sucursales.cusco);
      duraciones.push(performance.now() - inicio);
    }
    duraciones.sort((una, otra) => una - otra);
    const p95 = duraciones[Math.ceil(CALCULOS_MEDIDOS * PERCENTIL) - 1];
    // La medición queda en el log de CI para el cierre del spec.
    console.info(`sumarDiasHabiles n=${DIAS_MEDIDOS}: p95 ${p95.toFixed(2)} ms en ${CALCULOS_MEDIDOS} cálculos`);
    expect(p95).toBeLessThan(P95_MAXIMO_MS);
  });
});
