import type { ContextoParametro } from '@vitrina/plataforma/parametros';
import { ParametrosCalendarioCfg } from '../src/catalogos/parametros-calendario.js';

const CUSCO = '0193f3a0-0000-7000-8000-0000000a0001';

describe('ParametrosCalendarioCfg (spec 19c)', () => {
  const consultas: { codigo: string; contexto?: ContextoParametro }[] = [];
  const adaptador = new ParametrosCalendarioCfg({
    valor: async <T>(codigo: string, contexto?: ContextoParametro) => {
      consultas.push({ codigo, contexto });
      return { valor: (contexto?.sucursalId !== CUSCO) as T, origen: 'SUCURSAL' as never };
    },
  });

  beforeEach(() => {
    consultas.length = 0;
  });

  it('resuelve plat.calendario.sabado_habil con la sucursal del cálculo (TR-RN-014)', async () => {
    await expect(adaptador.sabadoHabil(CUSCO)).resolves.toBe(false);
    expect(consultas).toEqual([{ codigo: 'plat.calendario.sabado_habil', contexto: { sucursalId: CUSCO } }]);
  });

  it('sin sucursal no pasa niveles: ParametroPort cae en el tenant y el defecto', async () => {
    await expect(adaptador.sabadoHabil(null)).resolves.toBe(true);
    expect(consultas).toEqual([{ codigo: 'plat.calendario.sabado_habil', contexto: {} }]);
  });
});
