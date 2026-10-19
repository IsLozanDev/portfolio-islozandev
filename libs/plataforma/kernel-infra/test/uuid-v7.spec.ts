import { uuidV7 } from '../src/uuid-v7.js';

describe('uuidV7', () => {
  it('genera UUID versión 7', () => {
    expect(uuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('crece con el tiempo', async () => {
    const primero = uuidV7();
    await new Promise((r) => setTimeout(r, 2));
    expect(uuidV7() > primero).toBe(true);
  });
});
