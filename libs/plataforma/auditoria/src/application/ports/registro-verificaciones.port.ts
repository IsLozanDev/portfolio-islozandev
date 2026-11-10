import type { PuntoDeControl, TramoVerificado, Verificacion } from '../../domain/verificacion.js';

/** aud.verificacion_integridad y las funciones de la cadena del tenant del contexto, dentro de UnitOfWork.run. */
export interface RegistroVerificaciones {
  /** Punto de partida de la siguiente corrida incremental: hasta_numero y ultimo_hash de la última OK. */
  ultimaCorrecta(): Promise<PuntoDeControl | null>;
  ultima(): Promise<Verificacion | null>;
  guardar(verificacion: Verificacion): Promise<void>;
  /** aud.verificar_cadena: hasta `limite` filas después de `desde`; se detiene en la primera falla. */
  verificarTramo(desde: PuntoDeControl, limite: number): Promise<TramoVerificado>;
  /** aud.maximo_numero: 0 si el tenant no tiene filas. */
  maximoNumero(): Promise<string>;
}

/**
 * aud.tenants_con_eventos: la única lectura entre tenants, solo ids. Va fuera de toda transacción de
 * tenant: el adaptador usa el DataSource, que solo tienen apps/worker y el CLI.
 */
export interface TenantsConEventos {
  listar(): Promise<string[]>;
}
