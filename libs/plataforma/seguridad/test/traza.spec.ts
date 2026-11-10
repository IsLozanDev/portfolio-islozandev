import { traceIdDeTraceparent } from '../src/interface/traza.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';

describe('traceIdDeTraceparent (spec 20a)', () => {
  it('toma el trace-id de un traceparent W3C válido', () => {
    expect(traceIdDeTraceparent(`00-${TRACE_ID}-00f067aa0ba902b7-01`)).toBe(TRACE_ID);
  });

  it.each([
    ['ausente', undefined],
    ['vacío', ''],
    ['basura', 'no-es-un-traceparent'],
    ['en mayúsculas', `00-${TRACE_ID.toUpperCase()}-00f067aa0ba902b7-01`],
    ['otra versión', `01-${TRACE_ID}-00f067aa0ba902b7-01`],
    ['trace en ceros', `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`],
    ['parent-id corto', `00-${TRACE_ID}-00f067aa-01`],
  ])('%s: sin trace-id', (_caso, traceparent) => {
    expect(traceIdDeTraceparent(traceparent)).toBeUndefined();
  });
});
