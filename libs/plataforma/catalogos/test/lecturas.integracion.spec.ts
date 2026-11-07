import { performance } from 'node:perf_hooks';
import type { Redis } from 'ioredis';
import { crearClienteRedis } from '@vitrina/plataforma/seguridad';
import { AjustarItem } from '../src/application/ajustar-item.js';
import { ConsultarItems, type ItemsConsultados } from '../src/application/consultar-items.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import { LectorItems } from '../src/application/lector-items.js';
import { ValidarItem } from '../src/application/validar-item.js';
import { CatalogoNoExisteError } from '../src/domain/errores.js';
import { CacheItemsRedis } from '../src/infrastructure/redis/cache-items.redis.js';
import { crearEntornoCatalogos, type EntornoCatalogos } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';
const LECTURAS_MEDIDAS = 200;
const P95_MAXIMO_MS = 50;
// Id de la semilla de 01f_cat.sql.
const PLIN = 'ca700000-0000-0000-0001-000000000003';

function percentil95(muestras: number[]): number {
  const ordenadas = [...muestras].sort((uno, otro) => uno - otro);
  return ordenadas[Math.ceil(ordenadas.length * 0.95) - 1];
}

const codigos = (resultado: ItemsConsultados) => (resultado.noModificado ? [] : resultado.items.map((item) => item.codigo));

describeConDb('ConsultarItems y ValidarItem (TR-RF-024, TR-RF-027, PostgreSQL 16 y Redis 7)', () => {
  let entorno: EntornoCatalogos;
  let redis: Redis;
  let caido: Redis;
  let consultar: ConsultarItems;
  let validar: ValidarItem;
  let consultarSinRedis: ConsultarItems;
  const avisos: Record<string, unknown>[] = [];
  const comoClinica = <T>(trabajo: () => Promise<T>) => entorno.en(entorno.tenants.cliente, trabajo);

  beforeAll(async () => {
    entorno = await crearEntornoCatalogos();
    redis = crearClienteRedis(REDIS_URL);
    caido = crearClienteRedis(REDIS_INACCESIBLE);
    const { unidadDeTrabajo, contexto, reloj, lectura } = entorno.dependencias;
    const lector = new LectorItems({ lectura, cache: new CacheItemsRedis(redis), reloj });
    const lectorSinRedis = new LectorItems({ lectura, cache: new CacheItemsRedis(caido), reloj, aviso: (_mensaje, datos) => avisos.push(datos) });
    consultar = new ConsultarItems({ unidadDeTrabajo, contexto, lector });
    validar = new ValidarItem({ unidadDeTrabajo, contexto, lector });
    consultarSinRedis = new ConsultarItems({ unidadDeTrabajo, contexto, lector: lectorSinRedis });
  });

  afterAll(async () => {
    caido?.disconnect();
    await redis?.quit();
    await entorno?.cerrar();
  });

  it('TR-CA-063: MEDIO_PAGO devuelve los globales vigentes más «Tarjeta Diners» propio', async () => {
    await comoClinica(() =>
      new GuardarItemPropio(entorno.dependencias).crear({
        catalogo: 'MEDIO_PAGO',
        codigo: 'DINERS',
        codigoExterno: null,
        nombre: 'Tarjeta Diners',
        abreviatura: null,
        orden: 5,
        atributos: {},
        vigenteDesde: '2026-01-01',
        vigenteHasta: null,
        activo: true,
        actorId: entorno.tenants.usuarioId,
      }),
    );
    expect(codigos(await comoClinica(() => consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })))).toEqual(['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA', 'DINERS']);
    expect(codigos(await entorno.en(entorno.tenants.operador, () => consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })))).toEqual([
      'EFECTIVO',
      'YAPE',
      'PLIN',
      'TARJETA',
    ]);
  });

  it('TR-CA-064: repetir con el ETag da no modificado', async () => {
    const { etag } = await comoClinica(() => consultar.ejecutar({ catalogo: 'MEDIO_PAGO' }));
    expect(await comoClinica(() => consultar.ejecutar({ catalogo: 'MEDIO_PAGO', siNoCoincide: etag }))).toEqual({ noModificado: true, etag });
  });

  it('TR-CA-065: un catálogo inexistente da CATALOGO_NO_EXISTE', async () => {
    await expect(comoClinica(() => consultar.ejecutar({ catalogo: 'NO_EXISTE' }))).rejects.toThrow(CatalogoNoExisteError);
  });

  it('TR-CA-070 y TR-CA-071: DNI válido con longitud 8; Plin oculto da OCULTO; un código inventado, INEXISTENTE', async () => {
    expect(await comoClinica(() => validar.validarItem('TIPO_DOC_IDENTIDAD', 'DNI'))).toEqual({
      valido: true,
      motivo: null,
      atributos: { longitud: 8, regex: '^[0-9]{8}$' },
    });
    await comoClinica(() =>
      new AjustarItem(entorno.dependencias).ejecutar({
        catalogo: 'MEDIO_PAGO',
        itemId: PLIN,
        visible: false,
        orden: null,
        alias: null,
        version: null,
        actorId: entorno.tenants.usuarioId,
      }),
    );
    expect(await comoClinica(() => validar.validarItem('MEDIO_PAGO', 'PLIN'))).toMatchObject({ valido: false, motivo: 'OCULTO' });
    expect(await comoClinica(() => validar.validarItem('MEDIO_PAGO', 'BITCOIN'))).toEqual({ valido: false, motivo: 'INEXISTENTE', atributos: null });
  });

  it('con Redis detenido la lectura responde lo mismo desde la base y deja el aviso cat.redis.error', async () => {
    const conRedis = await comoClinica(() => consultar.ejecutar({ catalogo: 'MEDIO_PAGO' }));
    expect(await comoClinica(() => consultarSinRedis.ejecutar({ catalogo: 'MEDIO_PAGO' }))).toEqual(conRedis);
    expect(avisos.map((aviso) => aviso.evento)).toContain('cat.redis.error');
  });

  it(`TR-RNF-102: con caché caliente, el p95 de ${LECTURAS_MEDIDAS} lecturas es menor a ${P95_MAXIMO_MS} ms`, async () => {
    await comoClinica(() => consultar.ejecutar({ catalogo: 'MEDIO_PAGO' }));
    const duraciones: number[] = [];
    for (let vuelta = 0; vuelta < LECTURAS_MEDIDAS; vuelta += 1) {
      const inicio = performance.now();
      await comoClinica(() => consultar.ejecutar({ catalogo: 'MEDIO_PAGO' }));
      duraciones.push(performance.now() - inicio);
    }
    const p95 = percentil95(duraciones);
    console.info(`cat.items p95 con caché caliente: ${p95.toFixed(2)} ms en ${LECTURAS_MEDIDAS} lecturas`);
    expect(p95).toBeLessThan(P95_MAXIMO_MS);
  });
});
