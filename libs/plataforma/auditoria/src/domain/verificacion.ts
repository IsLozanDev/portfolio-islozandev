export const MODOS_VERIFICACION = ['INCREMENTAL', 'COMPLETA'] as const;
export type ModoVerificacion = (typeof MODOS_VERIFICACION)[number];

export const MOTIVOS_ROTURA = ['HASH', 'ENLACE', 'HUECO', 'TRUNCADA'] as const;
export type MotivoRotura = (typeof MOTIVOS_ROTURA)[number];

export type EstadoVerificacion = 'OK' | 'ROTA';

/** Filas por llamada a aud.verificar_cadena: acota la transacción en un tenant grande. */
export const LOTE_VERIFICACION = 10_000;
/** hash_anterior del primer registro de cada tenant (spec 20a). */
export const HASH_INICIAL = '0'.repeat(64);
const NUMERO_INICIAL = '0';

// Los números de la cadena son bigint en la base: viajan como texto para no perder precisión.

export interface PuntoDeControl {
  numero: string;
  hash: string;
}

/** Lo que devuelve un tramo de aud.verificar_cadena. Sin falla, numeroRoto y motivo son null. */
export interface TramoVerificado {
  ultimoNumero: string;
  ultimoHash: string;
  filas: number;
  numeroRoto: string | null;
  motivo: MotivoRotura | null;
}

/** Fila de aud.verificacion_integridad. */
export interface Verificacion {
  id: string;
  tenantId: string;
  modo: ModoVerificacion;
  desdeNumero: string;
  hastaNumero: string;
  ultimoHash: string;
  filas: number;
  estado: EstadoVerificacion;
  numeroRoto: string | null;
  motivo: MotivoRotura | null;
  iniciadaEn: Date;
  terminadaEn: Date;
}

/** Cómo terminó el recorrido de la cadena, antes de guardarlo como Verificacion. */
export interface ResultadoVerificacion {
  desde: PuntoDeControl;
  hasta: PuntoDeControl;
  filas: number;
  numeroRoto: string | null;
  motivo: MotivoRotura | null;
}

/** INCREMENTAL parte de la última verificación OK; COMPLETA, o sin verificaciones previas, desde el inicio. */
export function puntoDePartida(modo: ModoVerificacion, ultimaCorrecta: PuntoDeControl | null): PuntoDeControl {
  if (modo === 'COMPLETA' || !ultimaCorrecta) return { numero: NUMERO_INICIAL, hash: HASH_INICIAL };
  return ultimaCorrecta;
}

/** Sin filas desde el punto de partida todavía no hay nada que recorrer. */
export function resultadoInicial(desde: PuntoDeControl): ResultadoVerificacion {
  return { desde, hasta: desde, filas: 0, numeroRoto: null, motivo: null };
}

/** Faltan filas que ya se verificaron: la cadena sola no lo ve (TR-RN-028). */
export function estaTruncada(maximoNumero: string, desde: PuntoDeControl): boolean {
  return BigInt(maximoNumero) < BigInt(desde.numero);
}

export function resultadoTruncado(desde: PuntoDeControl): ResultadoVerificacion {
  return { ...resultadoInicial(desde), numeroRoto: desde.numero, motivo: 'TRUNCADA' };
}

export function sumarTramo(resultado: ResultadoVerificacion, tramo: TramoVerificado): ResultadoVerificacion {
  return {
    desde: resultado.desde,
    hasta: { numero: tramo.ultimoNumero, hash: tramo.ultimoHash },
    filas: resultado.filas + tramo.filas,
    numeroRoto: tramo.numeroRoto,
    motivo: tramo.motivo,
  };
}

export function estaRota(resultado: ResultadoVerificacion): boolean {
  return resultado.motivo !== null;
}

/** Hay que pedir otro tramo si este vino lleno y sin falla. */
export function quedanFilas(tramo: TramoVerificado, limite: number): boolean {
  return tramo.motivo === null && tramo.filas === limite;
}

export function aVerificacion(
  resultado: ResultadoVerificacion,
  datos: { id: string; tenantId: string; modo: ModoVerificacion; iniciadaEn: Date; terminadaEn: Date },
): Verificacion {
  return {
    ...datos,
    desdeNumero: resultado.desde.numero,
    hastaNumero: resultado.hasta.numero,
    ultimoHash: resultado.hasta.hash,
    filas: resultado.filas,
    estado: estaRota(resultado) ? 'ROTA' : 'OK',
    numeroRoto: resultado.numeroRoto,
    motivo: resultado.motivo,
  };
}
