import { destinoConVuelta } from './destino-con-vuelta';

describe('destinoConVuelta', () => {
  it('lleva la página actual en ?volverA= codificada', () => {
    const destino = destinoConVuelta('http://127.0.0.1:4200', 'http://127.0.0.1:4201/consola/soporte?x=1');

    expect(destino).toBe('http://127.0.0.1:4200/?volverA=http%3A%2F%2F127.0.0.1%3A4201%2Fconsola%2Fsoporte%3Fx%3D1');
  });

  it('rechaza una URL de administración vacía (ambiente sin configurar)', () => {
    expect(() => destinoConVuelta('', 'http://127.0.0.1:4201/')).toThrow();
  });
});
