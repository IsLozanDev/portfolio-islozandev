import { SystemClock } from '../src/system-clock.js';

describe('SystemClock', () => {
  it('now() devuelve la hora actual', () => {
    const antes = Date.now();
    const ahora = new SystemClock().now().getTime();
    expect(ahora).toBeGreaterThanOrEqual(antes);
    expect(ahora).toBeLessThanOrEqual(Date.now());
  });
});
