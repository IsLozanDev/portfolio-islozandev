import { Redis } from 'ioredis';

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
