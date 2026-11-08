import { lectorEventos } from './lector-eventos';

const AVANCE = { tipo: 'avance', estado: 'EN_PROCESO', avance: 42 };
const FIN = { tipo: 'fin', estado: 'APLICADA', resumen: { altas: 18, cambios: 0, bajas: 0, sin_cambios: 1874 }, motivo: null };
const evento = (nombre: string, datos: unknown, salto = '\n') => `event: ${nombre}${salto}data: ${JSON.stringify(datos)}${salto}${salto}`;

describe('lectorEventos', () => {
  it('un evento partido en dos fragmentos sale entero en el segundo', () => {
    const completo = evento('avance', AVANCE);
    const primero = lectorEventos('', completo.slice(0, 20));
    expect(primero.avisos).toEqual([]);

    const segundo = lectorEventos(primero.pendiente, completo.slice(20));
    expect(segundo).toEqual({ avisos: [AVANCE], pendiente: '' });
  });

  it('dos eventos en un fragmento salen los dos, en orden, con el resumen en camelCase', () => {
    const lectura = lectorEventos('', evento('avance', AVANCE) + evento('fin', FIN));
    expect(lectura.avisos).toEqual([
      AVANCE,
      { tipo: 'fin', estado: 'APLICADA', resumen: { altas: 18, cambios: 0, bajas: 0, sinCambios: 1874 }, motivo: null },
    ]);
    expect(lectura.pendiente).toBe('');
  });

  it('descarta los comentarios `: ping`', () => {
    const lectura = lectorEventos('', `: ping\n\n${evento('avance', AVANCE)}: ping\n\n`);
    expect(lectura).toEqual({ avisos: [AVANCE], pendiente: '' });
  });

  it('acepta `\\r\\n`, también partido entre dos fragmentos', () => {
    const completo = evento('avance', AVANCE, '\r\n');
    const corte = completo.indexOf('\r\n') + 1;
    const primero = lectorEventos('', completo.slice(0, corte));
    expect(primero.pendiente.endsWith('\r')).toBe(true);

    expect(lectorEventos(primero.pendiente, completo.slice(corte)).avisos).toEqual([AVANCE]);
    expect(lectorEventos('', `${completo}${evento('fin', { ...FIN, estado: 'FALLIDA', resumen: null, motivo: 'x' }, '\r\n')}`).avisos).toHaveLength(2);
  });

  it('un evento sin línea en blanco final queda pendiente', () => {
    const lectura = lectorEventos('', `event: avance\ndata: ${JSON.stringify(AVANCE)}\n`);
    expect(lectura.avisos).toEqual([]);
    expect(lectura.pendiente).toBe(`event: avance\ndata: ${JSON.stringify(AVANCE)}\n`);
  });
});
