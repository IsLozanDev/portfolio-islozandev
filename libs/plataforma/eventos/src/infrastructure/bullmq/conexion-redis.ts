import { Redis } from 'ioredis';

const TIEMPO_CONEXION_MS = 1000;

/**
 * Conexión para BullMQ. `maxRetriesPerRequest: null` lo exige BullMQ en los `Worker`: con Redis caído,
 * los comandos esperan la reconexión en vez de romper el procesamiento.
 */
export function crearConexionColas(url: string, alFallar: (error: Error) => void): Redis {
  const redis = new Redis(url, { maxRetriesPerRequest: null });
  // Sin listener, ioredis escribe cada reintento como "Unhandled error event".
  redis.on('error', alFallar);
  return redis;
}

/**
 * Para encolar: un intento por comando, sin esperar la reconexión. Con Redis caído, el relay falla rápido y no avanza el cursor.
 * Conecta con el primer uso: la api arranca aunque Redis no esté.
 */
export function crearConexionProductor(url: string, alFallar: (error: Error) => void): Redis {
  const redis = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: TIEMPO_CONEXION_MS, lazyConnect: true });
  redis.on('error', alFallar);
  return redis;
}
