import type { TenantScope } from '@vitrina/plataforma/kernel';
import type { CacheParametros, ResolucionSql, ValorEfectivo, VersionesParametros } from '../src/application/ports/repositorios.js';
import { claveParametro, ResolverParametro, TTL_PARAMETROS_SEGUNDOS } from '../src/application/resolver-parametro.js';
import { DefinicionParametro } from '../src/domain/definicion-parametro.js';
import { ParametroNoDefinidoError } from '../src/domain/errores.js';
import { CacheParametrosMemoria } from '../src/infrastructure/cache-parametros.memoria.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const EMPRESA_AREQUIPA = '0193f3a0-0000-7000-8000-000000000012';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const CAYMA = '0193f3a0-0000-7000-8000-000000000201';
const SESION = 'plat.sesion.minutos_inactividad';

const definicionSesion = (obsoleto = false) =>
  DefinicionParametro.reconstituir({
    codigo: SESION,
    productoCodigo: 'PLAT',
    descripcion: 'Minutos de inactividad',
    tipo: 'NUMERO',
    valorDefecto: 30,
    alcanceMaximo: 'TENANT',
    esquema: null,
    obsoleto,
  });

/** Resolución falsa: cuenta llamadas y devuelve lo configurado por código. */
class ResolucionFalsa implements ResolucionSql {
  versionesActuales: VersionesParametros = { vt: 1, vd: 1 };
  readonly llamadas: { codigo: string; empresaId: string | null; sucursalId: string | null }[] = [];
  readonly efectivos = new Map<string, ValorEfectivo>([[SESION, { valor: 30, origen: 'DEFECTO' }]]);

  async valor(codigo: string, _tenantId: string, empresaId: string | null, sucursalId: string | null) {
    this.llamadas.push({ codigo, empresaId, sucursalId });
    return this.efectivos.get(codigo) ?? null;
  }

  async versiones() {
    return this.versionesActuales;
  }
}

class CacheCaida implements CacheParametros {
  async leer(): Promise<never> {
    throw new Error('connect ECONNREFUSED redis://usuario:clave@127.0.0.1:1');
  }

  async guardar(): Promise<never> {
    throw new Error('connect ECONNREFUSED redis://usuario:clave@127.0.0.1:1');
  }
}

function resolverCon(opciones: { cache?: CacheParametros; sucursalDelContexto?: string; obsoleto?: boolean } = {}) {
  const resolucion = new ResolucionFalsa();
  const cache = opciones.cache ?? new CacheParametrosMemoria();
  const avisos: Record<string, unknown>[] = [];
  const alcance: TenantScope = { tenantId: TENANT, branchId: opciones.sucursalDelContexto };
  const definiciones = { buscar: async (codigo: string) => (codigo === SESION ? definicionSesion(opciones.obsoleto) : null) };
  const resolver = new ResolverParametro(
    { run: (trabajo) => trabajo() },
    { current: () => alcance, run: (_alcance, trabajo) => trabajo() },
    definiciones,
    resolucion,
    cache,
    (_mensaje, datos) => avisos.push(datos),
  );
  return { resolver, resolucion, cache, avisos };
}

describe('ResolverParametro (TR-RF-032, TR-RNF-101)', () => {
  it('TR-CA-084: sin valores configurados devuelve el defecto 30 con origen DEFECTO', async () => {
    const { resolver } = resolverCon();
    expect(await resolver.valor<number>(SESION)).toEqual({ valor: 30, origen: 'DEFECTO' });
  });

  it('TR-CA-085: un código inexistente lanza PARAMETRO_NO_DEFINIDO y no se cachea', async () => {
    const { resolver, resolucion, cache } = resolverCon();
    await expect(resolver.valor('rest.mesa.color')).rejects.toThrow(ParametroNoDefinidoError);
    expect(resolucion.llamadas).toEqual([]);
    expect((cache as CacheParametrosMemoria).tamano).toBe(0);
  });

  it('la segunda resolución sale de la caché', async () => {
    const { resolver, resolucion } = resolverCon();
    await resolver.valor(SESION);
    await resolver.valor(SESION);
    expect(resolucion.llamadas).toHaveLength(1);
  });

  it('subir vt (cambio de un valor) invalida: la siguiente resolución ve el valor nuevo sin esperar el TTL', async () => {
    const { resolver, resolucion } = resolverCon();
    await resolver.valor(SESION);
    resolucion.efectivos.set(SESION, { valor: 20, origen: 'TENANT' });
    resolucion.versionesActuales = { vt: 2, vd: 1 };
    expect(await resolver.valor(SESION)).toEqual({ valor: 20, origen: 'TENANT' });
  });

  it('subir vd (cambio de un defecto en el manifiesto) también invalida', async () => {
    const { resolver, resolucion } = resolverCon();
    await resolver.valor(SESION);
    resolucion.efectivos.set(SESION, { valor: 45, origen: 'DEFECTO' });
    resolucion.versionesActuales = { vt: 1, vd: 2 };
    expect(await resolver.valor(SESION)).toEqual({ valor: 45, origen: 'DEFECTO' });
  });

  it('la clave lleva tenant, versiones, código y nivel', () => {
    const clave = claveParametro({ tenantId: TENANT, codigo: SESION, empresaId: null, sucursalId: JOCKEY }, { vt: 3, vd: 7 });
    expect(clave).toBe(`cfg:${TENANT}:3.7:${SESION}:-:${JOCKEY}`);
    expect(TTL_PARAMETROS_SEGUNDOS).toBe(60);
  });

  it('sin empresa ni sucursal usa la sucursal del contexto', async () => {
    const { resolver, resolucion } = resolverCon({ sucursalDelContexto: JOCKEY });
    await resolver.valor(SESION);
    expect(resolucion.llamadas[0]).toEqual({ codigo: SESION, empresaId: null, sucursalId: JOCKEY });
  });

  it('TR-CA-083: con empresa explícita no toma la sucursal del contexto y devuelve el origen que resuelve la base', async () => {
    const { resolver, resolucion } = resolverCon({ sucursalDelContexto: JOCKEY });
    resolucion.efectivos.set(SESION, { valor: 12, origen: 'EMPRESA' });
    expect(await resolver.valor(SESION, { empresaId: EMPRESA_AREQUIPA })).toEqual({ valor: 12, origen: 'EMPRESA' });
    expect(resolucion.llamadas[0]).toEqual({ codigo: SESION, empresaId: EMPRESA_AREQUIPA, sucursalId: null });
    await resolver.valor(SESION, { sucursalId: CAYMA });
    expect(resolucion.llamadas[1]).toEqual({ codigo: SESION, empresaId: null, sucursalId: CAYMA });
  });

  it('con Redis caído resuelve desde la base y avisa sin exponer la URL', async () => {
    const { resolver, avisos } = resolverCon({ cache: new CacheCaida() });
    expect(await resolver.valor(SESION)).toEqual({ valor: 30, origen: 'DEFECTO' });
    expect(avisos).toEqual([
      { evento: 'cfg.redis.error', error: 'Error' },
      { evento: 'cfg.redis.error', error: 'Error' },
    ]);
    expect(JSON.stringify(avisos)).not.toContain('clave');
  });

  it('un parámetro obsoleto resuelve y avisa, también con acierto de caché', async () => {
    const { resolver, avisos } = resolverCon({ obsoleto: true });
    expect(await resolver.valor(SESION)).toEqual({ valor: 30, origen: 'DEFECTO' });
    await resolver.valor(SESION);
    expect(avisos).toEqual([
      { evento: 'cfg.parametro.obsoleto', codigo: SESION },
      { evento: 'cfg.parametro.obsoleto', codigo: SESION },
    ]);
  });
});
