import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FirmadorEnlace } from '../../application/ports/firmador-enlace.js';
import { estaHabilitado, type CanalNotificacion } from '../../domain/canal.js';
import { enlaceVigente, type CargaEnlace } from '../../domain/enlace-preferencias.js';

const ALGORITMO = 'sha256';
const SEPARADOR = '.';
const PARTES_DEL_TOKEN = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LARGO_MAXIMO_HASH = 80;

/** Lo que viaja en el token: el vencimiento en milisegundos para no depender del formato de fecha. */
interface CargaSerializada {
  tenantId: string;
  canal: string;
  destinoHash: string;
  personaId?: string;
  venceEn: number;
}

/**
 * Token `<carga en base64url>.<HMAC-SHA256 en base64url>`, sin tabla: rotar la clave invalida todos los enlaces.
 * La carga no lleva el correo en claro (solo su hash), pero tampoco va cifrada: no debe tener nada secreto.
 */
export class FirmadorEnlaceHmac implements FirmadorEnlace {
  constructor(private readonly clave: string) {}

  firmar(carga: CargaEnlace): string {
    const serializada: CargaSerializada = { ...carga, venceEn: carga.venceEn.getTime() };
    const cuerpo = Buffer.from(JSON.stringify(serializada), 'utf8').toString('base64url');
    return `${cuerpo}${SEPARADOR}${this.firma(cuerpo).toString('base64url')}`;
  }

  verificar(token: string, ahora: Date): CargaEnlace | null {
    const partes = token.split(SEPARADOR);
    if (partes.length !== PARTES_DEL_TOKEN) return null;
    const [cuerpo, firmaRecibida] = partes as [string, string];
    if (!this.firmaCoincide(cuerpo, firmaRecibida)) return null;
    const carga = leerCarga(cuerpo);
    if (!carga || !enlaceVigente(carga, ahora)) return null;
    return carga;
  }

  private firma(cuerpo: string): Buffer {
    return createHmac(ALGORITMO, this.clave).update(cuerpo).digest();
  }

  private firmaCoincide(cuerpo: string, firmaRecibida: string): boolean {
    const esperada = this.firma(cuerpo);
    const recibida = Buffer.from(firmaRecibida, 'base64url');
    return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
  }
}

/** La firma ya coincidió; aun así se valida la forma, por si la clave firmó algo que no es una carga. */
function leerCarga(cuerpo: string): CargaEnlace | null {
  const valor = parsear(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  if (!esCargaSerializada(valor)) return null;
  return {
    tenantId: valor.tenantId,
    canal: valor.canal as CanalNotificacion,
    destinoHash: valor.destinoHash,
    ...(valor.personaId ? { personaId: valor.personaId } : {}),
    venceEn: new Date(valor.venceEn),
  };
}

function parsear(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function esCargaSerializada(valor: unknown): valor is CargaSerializada {
  if (typeof valor !== 'object' || valor === null) return false;
  const carga = valor as Record<string, unknown>;
  return (
    esUuid(carga['tenantId']) &&
    typeof carga['canal'] === 'string' &&
    estaHabilitado(carga['canal']) &&
    typeof carga['destinoHash'] === 'string' &&
    carga['destinoHash'].length > 0 &&
    carga['destinoHash'].length <= LARGO_MAXIMO_HASH &&
    (carga['personaId'] === undefined || esUuid(carga['personaId'])) &&
    typeof carga['venceEn'] === 'number' &&
    Number.isFinite(carga['venceEn'])
  );
}

function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}
