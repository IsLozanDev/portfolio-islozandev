import type { TenantScope } from '@vitrina/plataforma/kernel';
import { ConsultarNiveles } from '../src/application/consultar-niveles.js';
import { ListarParametros } from '../src/application/listar-parametros.js';
import type { FiltroDefiniciones, NivelValor } from '../src/application/ports/repositorios.js';
import { DefinicionParametro, type DatosDefinicion } from '../src/domain/definicion-parametro.js';
import { ParametroNoDefinidoError } from '../src/domain/errores.js';

const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const EMPRESA_LIMA = '0193f3a0-0000-7000-8000-000000000011';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const AHORA = new Date('2026-10-24T15:00:00Z');

const definicion = (cambios: Partial<DatosDefinicion>) =>
  DefinicionParametro.reconstituir({
    codigo: 'rest.propina.porcentaje',
    productoCodigo: 'REST',
    descripcion: 'Propina',
    tipo: 'NUMERO',
    valorDefecto: 10,
    alcanceMaximo: 'SUCURSAL',
    esquema: null,
    obsoleto: false,
    ...cambios,
  });

const sinTransaccion = { run: <T>(trabajo: () => Promise<T>) => trabajo() };
const contextoCon = (alcance: TenantScope) => ({ current: () => alcance, run: <T>(_alcance: TenantScope, trabajo: () => Promise<T>) => trabajo() });

describe('ListarParametros (TR-RF-031 paso 1)', () => {
  function listarCon(contratados: string[], sucursal?: string) {
    const filtros: FiltroDefiniciones[] = [];
    const llamadasResolucion: (string | null)[] = [];
    const listar = new ListarParametros({
      unidadDeTrabajo: sinTransaccion,
      contexto: contextoCon({ tenantId: TENANT, branchId: sucursal }),
      definiciones: {
        listar: async (filtro) => {
          filtros.push(filtro);
          return [definicion({})];
        },
      },
      resolucion: {
        valor: async (_codigo, _tenantId, _empresaId, sucursalId) => {
          llamadasResolucion.push(sucursalId);
          return { valor: 0, origen: 'SUCURSAL' };
        },
        versiones: async () => ({ vt: 1, vd: 1 }),
      },
      productos: { vigentes: async () => contratados },
    });
    return { listar, filtros, llamadasResolucion };
  }

  it('muestra PLAT y los productos contratados, con el efectivo en la sucursal del contexto', async () => {
    const { listar, filtros, llamadasResolucion } = listarCon(['REST'], JOCKEY);
    expect(await listar.ejecutar({ texto: 'propina' })).toEqual([{ definicion: expect.any(DefinicionParametro), efectivo: { valor: 0, origen: 'SUCURSAL' } }]);
    expect(filtros[0]).toEqual({ productos: ['PLAT', 'REST'], texto: 'propina', incluirObsoletas: false });
    expect(llamadasResolucion).toEqual([JOCKEY]);
  });

  it('filtrar por un producto no contratado no busca nada de él', async () => {
    const { listar, filtros } = listarCon(['REST']);
    await listar.ejecutar({ productoCodigo: 'gym' });
    expect(filtros[0].productos).toEqual([]);
  });

  it('el filtro de producto no distingue mayúsculas', async () => {
    const { listar, filtros } = listarCon(['REST']);
    await listar.ejecutar({ productoCodigo: 'rest', incluirObsoletas: true });
    expect(filtros[0]).toMatchObject({ productos: ['REST'], incluirObsoletas: true });
  });
});

describe('ConsultarNiveles (TR-RF-033 paso 1)', () => {
  const niveles: NivelValor[] = [
    { alcance: 'TENANT', empresaId: null, sucursalId: null, entidadNombre: null, valor: 10, modificadoPor: ANA, modificadoEn: AHORA },
    { alcance: 'EMPRESA', empresaId: EMPRESA_LIMA, sucursalId: null, entidadNombre: 'Cfg Lima SAC', valor: 12, modificadoPor: ANA, modificadoEn: AHORA },
    { alcance: 'SUCURSAL', empresaId: null, sucursalId: JOCKEY, entidadNombre: 'Food court Jockey', valor: 0, modificadoPor: ANA, modificadoEn: AHORA },
  ];

  const consultarCon = (definiciones: DefinicionParametro[]) =>
    new ConsultarNiveles({
      unidadDeTrabajo: sinTransaccion,
      definiciones: { buscar: async (codigo) => definiciones.find((def) => def.codigo === codigo) ?? null },
      niveles: { deCodigo: async () => niveles },
    });

  it('devuelve la definición y cada nivel configurado', async () => {
    const consulta = await consultarCon([definicion({})]).ejecutar('rest.propina.porcentaje');
    expect(consulta.definicion.codigo).toBe('rest.propina.porcentaje');
    expect(consulta.niveles.map((nivel) => [nivel.alcance, nivel.entidadNombre, nivel.valor, nivel.fueraDeAlcance])).toEqual([
      ['TENANT', null, 10, false],
      ['EMPRESA', 'Cfg Lima SAC', 12, false],
      ['SUCURSAL', 'Food court Jockey', 0, false],
    ]);
  });

  it('marca fuera de alcance los niveles más específicos que el máximo actual', async () => {
    const consulta = await consultarCon([definicion({ alcanceMaximo: 'TENANT' })]).ejecutar('rest.propina.porcentaje');
    expect(consulta.niveles.map((nivel) => nivel.fueraDeAlcance)).toEqual([false, true, true]);
  });

  it('un código inexistente da PARAMETRO_NO_DEFINIDO', async () => {
    await expect(consultarCon([]).ejecutar('rest.mesa.color')).rejects.toThrow(ParametroNoDefinidoError);
  });
});
