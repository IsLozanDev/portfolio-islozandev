import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { ValidadorEsquema } from '../../domain/validador-esquema.js';
import { jsonCanonico } from '../../domain/json.js';

/** Subconjunto de JSON Schema que admite una definición (TR-RN-015). Otra palabra clave la rechaza. */
const PERMITIDAS = new Set(['minimum', 'maximum', 'enum', 'pattern', 'minLength', 'maxLength', 'type', 'properties', 'required', 'items']);

type Esquema = Record<string, unknown>;

export class ValidadorEsquemaAjv implements ValidadorEsquema {
  // verbose: el error trae parentSchema y el mensaje se arma con los límites del propio esquema.
  // strictTypes: false porque un esquema de NUMERO trae `minimum` sin `type`.
  private readonly ajv = new Ajv({ verbose: true, strictTypes: false });
  private readonly compilados = new Map<string, ValidateFunction>();

  soporta(esquema: object): string[] {
    const problemas = noSoportadas(esquema as Esquema, '').map((ruta) => `palabra clave no soportada: ${ruta}`);
    if (problemas.length > 0) return problemas;
    try {
      this.compilar(esquema);
      return [];
    } catch (e) {
      return [`esquema mal formado: ${(e as Error).message}`];
    }
  }

  validar(esquema: object, valor: unknown): string | null {
    const validar = this.compilar(esquema);
    if (validar(valor)) return null;
    return mensaje((validar.errors ?? [])[0]);
  }

  private compilar(esquema: object): ValidateFunction {
    const clave = jsonCanonico(esquema);
    let validar = this.compilados.get(clave);
    if (!validar) {
      validar = this.ajv.compile(esquema);
      this.compilados.set(clave, validar);
    }
    return validar;
  }
}

function noSoportadas(esquema: Esquema, ruta: string): string[] {
  const fuera: string[] = [];
  for (const [clave, valor] of Object.entries(esquema)) {
    const aqui = ruta ? `${ruta}.${clave}` : clave;
    if (!PERMITIDAS.has(clave)) {
      fuera.push(aqui);
    } else if (clave === 'properties' && esObjeto(valor)) {
      for (const [prop, sub] of Object.entries(valor)) if (esObjeto(sub)) fuera.push(...noSoportadas(sub, `${aqui}.${prop}`));
    } else if (clave === 'items' && esObjeto(valor)) {
      fuera.push(...noSoportadas(valor, aqui));
    }
  }
  return fuera;
}

const esObjeto = (v: unknown): v is Esquema => v !== null && typeof v === 'object' && !Array.isArray(v);

function mensaje(error: ErrorObject | undefined): string {
  const padre = (error?.parentSchema ?? {}) as Esquema;
  const donde = error?.instancePath ? ` en ${error.instancePath}` : '';
  switch (error?.keyword) {
    case 'minimum':
    case 'maximum':
      if (padre.minimum !== undefined && padre.maximum !== undefined) return `El valor${donde} debe estar entre ${padre.minimum} y ${padre.maximum}`;
      return padre.minimum !== undefined
        ? `El valor${donde} debe ser mayor o igual a ${padre.minimum}`
        : `El valor${donde} debe ser menor o igual a ${padre.maximum}`;
    case 'enum':
      return `El valor${donde} debe ser uno de: ${(padre.enum as unknown[]).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ')}`;
    case 'pattern':
      return `El valor${donde} no tiene el formato esperado`;
    case 'minLength':
    case 'maxLength':
      if (padre.minLength !== undefined && padre.maxLength !== undefined) {
        return `El texto${donde} debe tener entre ${padre.minLength} y ${padre.maxLength} caracteres`;
      }
      return padre.minLength !== undefined
        ? `El texto${donde} debe tener al menos ${padre.minLength} caracteres`
        : `El texto${donde} debe tener como máximo ${padre.maxLength} caracteres`;
    case 'required':
      return `Falta la propiedad ${(error.params as { missingProperty: string }).missingProperty}${donde}`;
    default:
      return `El valor${donde} no cumple el esquema (${error?.keyword ?? 'desconocido'})`;
  }
}
