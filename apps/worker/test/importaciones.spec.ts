import { randomUUID } from 'node:crypto';
import { abrirColaImportaciones, type ColaAbierta, type TrabajoImportacion } from '@vitrina/plataforma/catalogos';
import { TareaImportaciones } from '../src/importaciones/tarea-importaciones.js';

// Redis 7 de docker-compose (local) o del servicio de CI.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_INACCESIBLE = 'redis://127.0.0.1:1';
const ESPERA_MAXIMA_MS = 10_000;
const sinLog = () => undefined;

const trabajoDe = (): TrabajoImportacion => ({ importacionId: randomUUID(), tenantId: randomUUID(), usuarioId: randomUUID() });

describe('Cola de importaciones (spec 19b, Redis 7)', () => {
  let abierta: ColaAbierta;
  let tarea: TareaImportaciones;
  const procesados: TrabajoImportacion[] = [];
  let alProcesar: (() => void) | null = null;
  const reportados: { error: unknown; contexto?: Record<string, string> }[] = [];
  const idQueFalla = randomUUID();

  const esperarProcesados = (cantidad: number) =>
    new Promise<void>((resolver, rechazar) => {
      const limite = setTimeout(() => rechazar(new Error(`solo se procesaron ${procesados.length}`)), ESPERA_MAXIMA_MS);
      const revisar = () => {
        if (procesados.length < cantidad) return;
        clearTimeout(limite);
        resolver();
      };
      alProcesar = revisar;
      revisar();
    });

  beforeAll(async () => {
    abierta = abrirColaImportaciones(REDIS_URL, sinLog);
    tarea = new TareaImportaciones(
      REDIS_URL,
      {
        ejecutar: async (trabajo) => {
          if (trabajo.importacionId === idQueFalla) throw new Error('falla de prueba');
          procesados.push(trabajo);
          alProcesar?.();
        },
      },
      sinLog,
      sinLog,
      { reportar: (error, contexto) => void reportados.push({ error, contexto }) },
    );
    await tarea.onApplicationBootstrap();
  });

  afterAll(async () => {
    await tarea.beforeApplicationShutdown();
    await abierta.cerrar();
  });

  it('el worker recibe el trabajo encolado tal cual', async () => {
    const trabajo = trabajoDe();
    await abierta.cola.encolar(trabajo);
    await esperarProcesados(1);
    expect(procesados).toContainEqual(trabajo);
  });

  it('encolar dos veces la misma importación la procesa una sola vez (jobId)', async () => {
    const trabajo = trabajoDe();
    await abierta.cola.encolar(trabajo);
    await abierta.cola.encolar(trabajo);
    await esperarProcesados(2);
    await new Promise((resolver) => setTimeout(resolver, 500));
    expect(procesados.filter((procesado) => procesado.importacionId === trabajo.importacionId)).toHaveLength(1);
  });

  it('un trabajo que falla en todos sus intentos se reporta una vez, con el nombre de la cola (spec 21)', async () => {
    await abierta.cola.encolar({ ...trabajoDe(), importacionId: idQueFalla });
    const limite = Date.now() + ESPERA_MAXIMA_MS;
    while (reportados.length === 0 && Date.now() < limite) await new Promise((resolver) => setTimeout(resolver, 50));
    // Un posible segundo aviso llegaría enseguida: el segundo intento no tiene espera.
    await new Promise((resolver) => setTimeout(resolver, 500));
    expect(reportados).toEqual([{ error: expect.objectContaining({ message: 'falla de prueba' }), contexto: { cola: 'cat-importaciones' } }]);
  });

  it('con Redis inaccesible encolar falla enseguida en vez de esperar', async () => {
    const caida = abrirColaImportaciones(REDIS_INACCESIBLE, sinLog);
    const inicio = Date.now();
    await expect(caida.cola.encolar(trabajoDe())).rejects.toThrow();
    expect(Date.now() - inicio).toBeLessThan(2_000);
    await caida.cerrar();
  });
});
