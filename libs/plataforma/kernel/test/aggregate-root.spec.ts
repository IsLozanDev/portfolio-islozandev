import { AggregateRoot } from '../src/aggregate-root.js';

class Venta extends AggregateRoot {
  constructor(id: string, version = 0) {
    super(id, version);
  }

  registrar(total: number): void {
    this.raise({ eventType: 'venta.registrada', aggregateType: 'venta', schemaVersion: 1, payload: { total } });
  }
}

describe('AggregateRoot', () => {
  const id = '0190a8e0-0000-7000-8000-000000000001';

  it('incrementa la versión por cada evento levantado', () => {
    const venta = new Venta(id, 4);
    venta.registrar(10);
    venta.registrar(20);
    expect(venta.version).toBe(6);
    expect(venta.pullEvents().map((e) => e.aggregateVersion)).toEqual([5, 6]);
  });

  it('completa aggregateId, occurredAt y conserva el resto del evento', () => {
    const venta = new Venta(id);
    venta.registrar(10);
    const [evento] = venta.pullEvents();
    expect(evento).toMatchObject({
      eventType: 'venta.registrada',
      aggregateType: 'venta',
      aggregateId: id,
      aggregateVersion: 1,
      schemaVersion: 1,
      payload: { total: 10 },
    });
    expect(evento?.occurredAt).toBeInstanceOf(Date);
  });

  it('pullEvents devuelve los eventos y vacía la lista', () => {
    const venta = new Venta(id);
    venta.registrar(10);
    expect(venta.pullEvents()).toHaveLength(1);
    expect(venta.pullEvents()).toHaveLength(0);
  });
});
