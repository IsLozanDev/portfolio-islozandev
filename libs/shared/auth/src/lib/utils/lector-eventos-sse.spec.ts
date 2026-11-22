import { lectorEventosSse } from './lector-eventos-sse';

const AVANCE = '{"tipo":"avance","avance":42}';
const FIN = '{"tipo":"fin","resultado":"DISPONIBLE"}';
const evento = (nombre: string, datos: string, salto = '\n') => `event: ${nombre}${salto}data: ${datos}${salto}${salto}`;

describe('lectorEventosSse', () => {
  it('un evento partido en dos fragmentos sale entero en el segundo', () => {
    const completo = evento('avance', AVANCE);
    const primero = lectorEventosSse('', completo.slice(0, 20));
    expect(primero.eventos).toEqual([]);

    const segundo = lectorEventosSse(primero.pendiente, completo.slice(20));
    expect(segundo).toEqual({ eventos: [{ evento: 'avance', datos: AVANCE }], pendiente: '' });
  });

  it('dos eventos en un fragmento salen los dos, en orden, con su nombre', () => {
    const lectura = lectorEventosSse('', evento('avance', AVANCE) + evento('fin', FIN));
    expect(lectura).toEqual({
      eventos: [
        { evento: 'avance', datos: AVANCE },
        { evento: 'fin', datos: FIN },
      ],
      pendiente: '',
    });
  });

  it('descarta los comentarios `: ping` y los bloques sin datos', () => {
    const lectura = lectorEventosSse('', `: ping\n\nevent: vacio\n\n${evento('avance', AVANCE)}: ping\n\n`);
    expect(lectura).toEqual({ eventos: [{ evento: 'avance', datos: AVANCE }], pendiente: '' });
  });

  it('sin `event:` el nombre es `message`; varias líneas `data:` se unen con salto', () => {
    const lectura = lectorEventosSse('', 'data: uno\ndata: dos\n\n');
    expect(lectura.eventos).toEqual([{ evento: 'message', datos: 'uno\ndos' }]);
  });

  it('acepta `\\r\\n`, también partido entre dos fragmentos', () => {
    const completo = evento('avance', AVANCE, '\r\n');
    const corte = completo.indexOf('\r\n') + 1;
    const primero = lectorEventosSse('', completo.slice(0, corte));
    expect(primero.pendiente.endsWith('\r')).toBe(true);

    expect(lectorEventosSse(primero.pendiente, completo.slice(corte)).eventos).toEqual([{ evento: 'avance', datos: AVANCE }]);
    expect(lectorEventosSse('', `${completo}${evento('fin', FIN, '\r\n')}`).eventos).toHaveLength(2);
  });

  it('un evento sin línea en blanco final queda pendiente', () => {
    const lectura = lectorEventosSse('', `event: avance\ndata: ${AVANCE}\n`);
    expect(lectura.eventos).toEqual([]);
    expect(lectura.pendiente).toBe(`event: avance\ndata: ${AVANCE}\n`);
  });
});
