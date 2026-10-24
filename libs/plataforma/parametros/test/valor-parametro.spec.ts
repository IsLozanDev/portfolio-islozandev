import { ambitoValor } from '../src/domain/tipos.js';
import { ValorParametro } from '../src/domain/valor-parametro.js';

const ID = '0193f3a0-0000-7000-8000-00000000a001';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const JOCKEY = '0193f3a0-0000-7000-8000-000000000101';
const ANA = '0193f3a0-0000-7000-8000-000000000901';
const LUIS = '0193f3a0-0000-7000-8000-000000000902';
const AHORA = new Date('2026-10-24T15:00:00Z');

const fijar = () =>
  ValorParametro.fijar({ id: ID, tenantId: TENANT, codigo: 'rest.propina.porcentaje', ambito: ambitoValor('SUCURSAL', null, JOCKEY), valor: 0, por: ANA, ahora: AHORA });

describe('ValorParametro (TR-RF-031, TR-RF-033)', () => {
  it('fijar publica parametro.cambiado sin valor anterior', () => {
    const valorParametro = fijar();
    const [evento] = valorParametro.pullEvents();
    expect(evento).toMatchObject({
      eventType: 'parametro.cambiado',
      aggregateType: 'parametro_valor',
      aggregateId: ID,
      schemaVersion: 1,
      payload: { codigo: 'rest.propina.porcentaje', alcance: 'SUCURSAL', empresa_id: null, sucursal_id: JOCKEY, valor_anterior: null, valor: 0, restablecido: false, por: ANA },
    });
    expect(valorParametro.modificadoPor).toBe(ANA);
  });

  it('cambiar con otro valor actualiza actor y fecha y publica', () => {
    const valorParametro = fijar();
    valorParametro.pullEvents();
    const despues = new Date('2026-10-24T16:00:00Z');
    expect(valorParametro.cambiar(5, LUIS, despues)).toBe(true);
    expect(valorParametro.valor).toBe(5);
    expect(valorParametro.modificadoPor).toBe(LUIS);
    expect(valorParametro.modificadoEn).toEqual(despues);
    expect(valorParametro.pullEvents()[0].payload).toMatchObject({ valor_anterior: 0, valor: 5, restablecido: false, por: LUIS });
  });

  it('cambiar con el mismo valor no emite evento (TR-RNF-008)', () => {
    const valorParametro = ValorParametro.reconstituir(ID, 3, {
      tenantId: TENANT, codigo: 'rest.config.mesas', ambito: ambitoValor('TENANT'), valor: { a: 1, b: [1, 2] }, modificadoPor: ANA, modificadoEn: AHORA,
    });
    expect(valorParametro.cambiar({ b: [1, 2], a: 1 }, LUIS, new Date())).toBe(false);
    expect(valorParametro.pullEvents()).toEqual([]);
    expect(valorParametro.modificadoPor).toBe(ANA);
    expect(valorParametro.version).toBe(3);
  });

  it('restablecer publica restablecido: true con el valor anterior', () => {
    const valorParametro = fijar();
    valorParametro.pullEvents();
    valorParametro.restablecer(LUIS, AHORA);
    expect(valorParametro.pullEvents()[0].payload).toMatchObject({ valor_anterior: 0, valor: null, restablecido: true, por: LUIS });
  });
});
