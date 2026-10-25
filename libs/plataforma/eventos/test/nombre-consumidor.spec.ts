import { NombreConsumidorInvalidoError } from '../src/domain/errores.js';
import { NombreConsumidor } from '../src/domain/nombre-consumidor.js';
import { PERMISOS_EVT } from '../src/domain/permisos-evt.js';

describe('NombreConsumidor', () => {
  test.each(['aud', 'prueba-a', 'obs-metricas-2', `a${'b'.repeat(39)}`])('acepta %p', (nombre) => {
    expect(NombreConsumidor.de(nombre).valor).toBe(nombre);
  });

  test.each(['', 'ab', 'Prueba-a', 'prueba_a', '1aud', '-aud', 'aud:fallidos', `a${'b'.repeat(40)}`])(
    'rechaza %p',
    (nombre) => {
      expect(() => NombreConsumidor.de(nombre)).toThrow(NombreConsumidorInvalidoError);
    },
  );

  test('la cola es evt-<consumidor>', () => {
    expect(NombreConsumidor.de('prueba-a').cola).toBe('evt-prueba-a');
  });
});

describe('PERMISOS_EVT', () => {
  test('usan el formato producto.recurso.accion', () => {
    expect(Object.values(PERMISOS_EVT)).toEqual(['plat.evento.consultar', 'plat.evento.reprocesar']);
  });
});
