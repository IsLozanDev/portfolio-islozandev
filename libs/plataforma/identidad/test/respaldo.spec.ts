import { jest } from '@jest/globals';
import type { Clock } from '@vitrina/plataforma/kernel';
import type { ProveedorConfigurado, ProveedorIdentidad } from '../src/application/ports/proveedores.js';
import { CuotaNula } from '../src/infrastructure/cuota.nula.js';
import { ProveedorFalso } from '../src/infrastructure/falso/proveedor.falso.js';
import { APERTURA_MS, CircuitBreaker, UMBRAL_FALLOS } from '../src/infrastructure/respaldo/circuit-breaker.js';
import { ProveedorConRespaldo } from '../src/infrastructure/respaldo/proveedor-con-respaldo.js';

const TIMEOUT_MS = 3000;

class RelojFalso implements Clock {
  constructor(private actual = new Date('2026-11-16T12:00:00Z')) {}
  now(): Date {
    return this.actual;
  }
  avanzar(milisegundos: number): void {
    this.actual = new Date(this.actual.getTime() + milisegundos);
  }
}

// AbortController + setTimeout: lo controlan los temporizadores falsos de Jest, a diferencia de AbortSignal.timeout.
function señalConTemporizador(milisegundos: number): AbortSignal {
  const controlador = new AbortController();
  setTimeout(() => controlador.abort(new Error('timeout')), milisegundos);
  return controlador.signal;
}

function configurado(codigo: string, prioridad: number): ProveedorConfigurado {
  return { codigo, prioridad, ttlDias: 30, timeoutMs: TIMEOUT_MS };
}

const PRIMARIO = configurado('PRIMARIO', 1);
const SECUNDARIO = configurado('SECUNDARIO', 2);

function proveedorEspia(codigo: string, comportamiento: () => Promise<null>): ProveedorIdentidad & { llamadas: number } {
  const espia = {
    codigo,
    llamadas: 0,
    consultarDni: async () => {
      espia.llamadas += 1;
      return comportamiento();
    },
    consultarRuc: async () => {
      espia.llamadas += 1;
      return comportamiento();
    },
  };
  return espia;
}

describe('CircuitBreaker', () => {
  it(`se abre con ${UMBRAL_FALLOS} fallos seguidos y queda abierto ${APERTURA_MS} ms`, () => {
    const reloj = new RelojFalso();
    const breaker = new CircuitBreaker(reloj);
    for (let intento = 0; intento < UMBRAL_FALLOS - 1; intento++) breaker.registrarFallo();
    expect(breaker.permiteLlamada()).toBe(true);

    breaker.registrarFallo();
    expect(breaker.permiteLlamada()).toBe(false);
    reloj.avanzar(APERTURA_MS - 1);
    expect(breaker.permiteLlamada()).toBe(false);
  });

  it('un éxito reinicia la cuenta de fallos', () => {
    const breaker = new CircuitBreaker(new RelojFalso());
    for (let intento = 0; intento < UMBRAL_FALLOS - 1; intento++) breaker.registrarFallo();
    breaker.registrarExito();
    breaker.registrarFallo();
    expect(breaker.permiteLlamada()).toBe(true);
  });

  it('semiabierto: un fallo lo vuelve a abrir y un éxito lo cierra', () => {
    const reloj = new RelojFalso();
    const breaker = new CircuitBreaker(reloj);
    for (let intento = 0; intento < UMBRAL_FALLOS; intento++) breaker.registrarFallo();

    reloj.avanzar(APERTURA_MS);
    expect(breaker.permiteLlamada()).toBe(true);
    breaker.registrarFallo();
    expect(breaker.permiteLlamada()).toBe(false);

    reloj.avanzar(APERTURA_MS);
    expect(breaker.permiteLlamada()).toBe(true);
    breaker.registrarExito();
    breaker.registrarFallo();
    expect(breaker.permiteLlamada()).toBe(true);
  });
});

describe('ProveedorConRespaldo', () => {
  afterEach(() => jest.useRealTimers());

  it('TR-CA-116: si el de prioridad 1 no responde en 3 s, responde el de prioridad 2', async () => {
    jest.useFakeTimers();
    const lento = new ProveedorFalso({ codigo: 'PRIMARIO', demoraMs: 10_000 });
    const respaldo = new ProveedorFalso({ codigo: 'SECUNDARIO' });
    const consultor = new ProveedorConRespaldo([lento, respaldo], new RelojFalso(), señalConTemporizador);

    const consulta = consultor.consultar('DNI', '45781236', [PRIMARIO, SECUNDARIO]);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expect(consulta).resolves.toEqual({
      resultado: 'ENCONTRADO',
      documento: { tipo: 'DNI', datos: { nombres: 'Juana', apellidos: 'Quispe Mamani' } },
      proveedor: SECUNDARIO,
    });
  });

  it('corta por timeout aunque el proveedor ignore la señal', async () => {
    jest.useFakeTimers();
    const sordo = proveedorEspia('PRIMARIO', () => new Promise(() => undefined));
    const respaldo = new ProveedorFalso({ codigo: 'SECUNDARIO' });
    const consultor = new ProveedorConRespaldo([sordo, respaldo], new RelojFalso(), señalConTemporizador);

    const consulta = consultor.consultar('RUC', '20512345671', [PRIMARIO, SECUNDARIO]);
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expect(consulta).resolves.toMatchObject({ resultado: 'ENCONTRADO', proveedor: SECUNDARIO });
  });

  it('un error pasa al siguiente', async () => {
    const consultor = new ProveedorConRespaldo(
      [new ProveedorFalso({ codigo: 'PRIMARIO', falla: true }), new ProveedorFalso({ codigo: 'SECUNDARIO' })],
      new RelojFalso(),
    );
    await expect(consultor.consultar('RUC', '20498765433', [PRIMARIO, SECUNDARIO])).resolves.toMatchObject({
      resultado: 'ENCONTRADO',
      documento: { tipo: 'RUC', datos: { estado: 'BAJA DE OFICIO' } },
      proveedor: SECUNDARIO,
    });
  });

  it('null es NO_ENCONTRADO y no prueba el siguiente', async () => {
    const secundario = proveedorEspia('SECUNDARIO', async () => null);
    const consultor = new ProveedorConRespaldo([new ProveedorFalso({ codigo: 'PRIMARIO' }), secundario], new RelojFalso());

    await expect(consultor.consultar('DNI', '99999999', [PRIMARIO, SECUNDARIO])).resolves.toEqual({
      resultado: 'NO_ENCONTRADO',
      proveedor: PRIMARIO,
    });
    expect(secundario.llamadas).toBe(0);
  });

  it('si todos fallan responde NO_DISPONIBLE', async () => {
    const consultor = new ProveedorConRespaldo(
      [new ProveedorFalso({ codigo: 'PRIMARIO', falla: true }), new ProveedorFalso({ codigo: 'SECUNDARIO', falla: true })],
      new RelojFalso(),
    );
    await expect(consultor.consultar('DNI', '45781236', [PRIMARIO, SECUNDARIO])).resolves.toEqual({ resultado: 'NO_DISPONIBLE' });
  });

  it('salta un proveedor configurado sin adaptador', async () => {
    const consultor = new ProveedorConRespaldo([new ProveedorFalso({ codigo: 'SECUNDARIO' })], new RelojFalso());
    await expect(consultor.consultar('DNI', '45781236', [PRIMARIO, SECUNDARIO])).resolves.toMatchObject({
      resultado: 'ENCONTRADO',
      proveedor: SECUNDARIO,
    });
  });

  it('breaker: tras 5 fallos no llama al proveedor durante 30 s y después un éxito lo cierra', async () => {
    const reloj = new RelojFalso();
    let falla = true;
    const primario = proveedorEspia('PRIMARIO', async () => {
      if (falla) throw new Error('caído');
      return null;
    });
    const consultor = new ProveedorConRespaldo([primario, new ProveedorFalso({ codigo: 'SECUNDARIO' })], reloj);
    const consultar = () => consultor.consultar('DNI', '45781236', [PRIMARIO, SECUNDARIO]);

    for (let intento = 0; intento < UMBRAL_FALLOS; intento++) await consultar();
    expect(primario.llamadas).toBe(UMBRAL_FALLOS);

    reloj.avanzar(APERTURA_MS - 1);
    await expect(consultar()).resolves.toMatchObject({ proveedor: SECUNDARIO });
    expect(primario.llamadas).toBe(UMBRAL_FALLOS);

    falla = false;
    reloj.avanzar(1);
    await expect(consultar()).resolves.toEqual({ resultado: 'NO_ENCONTRADO', proveedor: PRIMARIO });
    expect(primario.llamadas).toBe(UMBRAL_FALLOS + 1);

    await consultar();
    expect(primario.llamadas).toBe(UMBRAL_FALLOS + 2);
  });

  it('usa AbortSignal.timeout por defecto', async () => {
    const consultor = new ProveedorConRespaldo([new ProveedorFalso({ codigo: 'PRIMARIO', demoraMs: 200 })], new RelojFalso());
    await expect(consultor.consultar('DNI', '45781236', [{ ...PRIMARIO, timeoutMs: 100 }])).resolves.toEqual({
      resultado: 'NO_DISPONIBLE',
    });
  });
});

describe('CuotaNula', () => {
  it('siempre reserva', async () => {
    const cuota = new CuotaNula();
    await expect(cuota.reservar()).resolves.toBe(true);
    await expect(cuota.liberar()).resolves.toBeUndefined();
  });
});
