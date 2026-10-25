import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EventoFallido } from '../src/domain/evento-fallido.js';
import { citaCreada, crearEntornoEntrega, type EntornoEntrega } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const INTENTOS = 8;

describeConDb('EntregarEvento con PostgreSQL 16 (TR-RF-093, TR-RN-034)', () => {
  let entorno: EntornoEntrega;
  let llamadas: Map<string, number>;

  const contar = (consumidor: string) => async () => {
    llamadas.set(consumidor, (llamadas.get(consumidor) ?? 0) + 1);
  };

  beforeAll(async () => {
    entorno = await crearEntornoEntrega();
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(() => {
    llamadas = new Map();
  });

  test('TR-CA-229: una reentrega del mismo evento no vuelve a llamar al manejador', async () => {
    entorno.suscripciones.suscribir('prueba-a', 'cita.creada', contar('prueba-a'));
    const evento = citaCreada();

    await entorno.entregar.ejecutar({ consumidor: 'prueba-a', evento, intento: 1, intentosMaximos: INTENTOS });
    await entorno.entregar.ejecutar({ consumidor: 'prueba-a', evento, intento: 1, intentosMaximos: INTENTOS });

    expect(llamadas.get('prueba-a')).toBe(1);
    expect(await entorno.procesados(evento.eventId)).toEqual(['prueba-a']);
  });

  test('cada consumidor tiene su propia idempotencia', async () => {
    entorno.suscripciones.suscribir('prueba-a', 'cita.creada', contar('prueba-a'));
    entorno.suscripciones.suscribir('prueba-b', 'cita.creada', contar('prueba-b'));
    const evento = citaCreada();

    for (const consumidor of ['prueba-a', 'prueba-b']) {
      await entorno.entregar.ejecutar({ consumidor, evento, intento: 1, intentosMaximos: INTENTOS });
    }

    expect(Object.fromEntries(llamadas)).toEqual({ 'prueba-a': 1, 'prueba-b': 1 });
    expect(await entorno.procesados(evento.eventId)).toEqual(['prueba-a', 'prueba-b']);
  });

  test('si el manejador lanza, la fila de procesado se revierte con el efecto', async () => {
    entorno.suscripciones.suscribir('prueba-falla', 'cita.creada', async () => {
      await entorno.unidadDeTrabajo.manager.query(`SELECT 1`);
      throw new Error('boom');
    });
    const evento = citaCreada();

    await expect(entorno.entregar.ejecutar({ consumidor: 'prueba-falla', evento, intento: 1, intentosMaximos: INTENTOS })).rejects.toThrow('boom');

    expect(await entorno.procesados(evento.eventId)).toEqual([]);
    expect(await entorno.fallidos(evento.eventId)).toEqual([]);
  });

  test('en el último intento deja la fila FALLIDO con los intentos y el último error, sin payload', async () => {
    entorno.suscripciones.suscribir('prueba-falla', 'cita.creada', async () => {
      throw new Error('boom final');
    });
    const evento = citaCreada({ payload: { paciente: 'María' } });

    await expect(
      entorno.entregar.ejecutar({ consumidor: 'prueba-falla', evento, intento: INTENTOS, intentosMaximos: INTENTOS }),
    ).rejects.toThrow('boom final');

    const [fallido] = await entorno.fallidos(evento.eventId);
    expect(fallido).toMatchObject({ consumidor: 'prueba-falla', estado: 'FALLIDO', intentos: INTENTOS, error: 'boom final' });
    expect(JSON.stringify(fallido)).not.toContain('María');
    expect(entorno.avisos.at(-1)?.datos).toEqual({
      consumidor: 'prueba-falla',
      event_id: evento.eventId,
      event_type: 'cita.creada',
      tenant_id: evento.tenantId,
      intentos: INTENTOS,
    });
  });

  test('el efecto corre con app.tenant_id igual al tenant del evento', async () => {
    let tenantVisto = '';
    entorno.suscripciones.suscribir('prueba-tenant', 'cita.creada', async () => {
      const [fila] = await entorno.unidadDeTrabajo.manager.query(`SELECT current_setting('app.tenant_id', true) AS tenant`);
      tenantVisto = fila.tenant;
    });
    const evento = citaCreada();

    await entorno.entregar.ejecutar({ consumidor: 'prueba-tenant', evento, intento: 1, intentosMaximos: INTENTOS });

    expect(tenantVisto).toBe(evento.tenantId);
  });

  test('TR-CA-234: un fallido que otra vía ya procesó pasa a PROCESADO sin llamar al manejador', async () => {
    entorno.suscripciones.suscribir('prueba-a', 'cita.creada', contar('prueba-a'));
    const evento = citaCreada();
    await entorno.dataSource.query(`INSERT INTO sync.evento_procesado (consumidor, event_id, tenant_id) VALUES ('prueba-a', $1, $2)`, [
      evento.eventId,
      evento.tenantId,
    ]);
    const fallido = EventoFallido.registrar({ id: uuidV7(), consumidor: 'prueba-a', evento, error: 'boom', intentos: INTENTOS, ahora: new Date() });
    await entorno.dependencias.contexto.run({ tenantId: evento.tenantId }, () =>
      entorno.unidadDeTrabajo.run(() => entorno.dependencias.fallidos.guardar(fallido)),
    );

    await entorno.entregar.ejecutar({ consumidor: 'prueba-a', evento, intento: 1, intentosMaximos: INTENTOS });

    expect(llamadas.get('prueba-a')).toBeUndefined();
    expect(await entorno.fallidos(evento.eventId)).toEqual([expect.objectContaining({ estado: 'PROCESADO', version: '1' })]);
  });

  test('un reproceso que vuelve a fallar suma los intentos', async () => {
    entorno.suscripciones.suscribir('prueba-falla', 'cita.creada', async () => {
      throw new Error('otra vez');
    });
    const evento = citaCreada();
    const entrega = { consumidor: 'prueba-falla', evento, intento: INTENTOS, intentosMaximos: INTENTOS };

    await expect(entorno.entregar.ejecutar(entrega)).rejects.toThrow();
    await expect(entorno.entregar.ejecutar(entrega)).rejects.toThrow();

    expect(await entorno.fallidos(evento.eventId)).toEqual([
      expect.objectContaining({ estado: 'FALLIDO', intentos: 2 * INTENTOS, error: 'otra vez', version: '1' }),
    ]);
  });

  test('un evento sin manejador en el consumidor no se procesa y se avisa', async () => {
    const evento = citaCreada({ eventType: 'cita.cancelada' });

    await entorno.entregar.ejecutar({ consumidor: 'prueba-a', evento, intento: 1, intentosMaximos: INTENTOS });

    expect(await entorno.procesados(evento.eventId)).toEqual([]);
    expect(entorno.avisos.at(-1)?.mensaje).toBe('Evento sin manejador en el consumidor');
  });
});
