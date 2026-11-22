import { formatoBytes } from './formato-bytes';

describe('formatoBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1258291, '1.2 MB'],
    [26214400, '25 MB'],
    [3 * 1024 ** 3, '3 GB'],
    [2048 * 1024 ** 3, '2,048 GB'],
  ])('%d bytes → %s', (bytes, texto) => {
    expect(formatoBytes(bytes)).toBe(texto);
  });
});
