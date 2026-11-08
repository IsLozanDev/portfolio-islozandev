import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors, type ValidatorFn } from '@angular/forms';
import { mensajeDeValidacion } from '@vitrina/shared/ui';
import { CLAVES_CONOCIDAS, LIMITE_ATRIBUTOS_BYTES, type AtributosItem, type ClaveConocida } from '../models/atributos';
import type { ItemCatalogo, SolicitudItem } from '../models/item';
import { mensajeClaveConocidaEnJson, MENSAJES_FORMULARIO_ITEM } from '../models/mensajes-formulario-item';
import { fechaDesdeIso, hoyEnLima, isoDesdeFecha } from './fecha-lima';

// Límites de TR-RF-023 que valida el dominio (19a).
const CODIGO_MAXIMO = 40;
const CODIGO_EXTERNO_MAXIMO = 40;
const NOMBRE_MAXIMO = 200;
const ABREVIATURA_MAXIMA = 30;
const ORDEN_MINIMO = -2_147_483_648;
const ORDEN_MAXIMO = 2_147_483_647;
const LONGITUD_MINIMA = 1;
const LONGITUD_MAXIMA = 100;
const REGEX_MAXIMA = 200;
const MASCARA_MAXIMA = 50;
const ENTERO = /^-?\d+$/;
const SANGRIA_JSON = 2;

export const ERROR_VIGENCIA_INVERTIDA = 'vigenciaInvertida';
export const ERROR_FECHA_INVALIDA = 'matDatepickerParse';
export const ERROR_REGEX_INVALIDA = 'regexInvalida';
export const ERROR_ENTERO = 'enteroInvalido';
export const ERROR_JSON_INVALIDO = 'jsonInvalido';
export const ERROR_CLAVE_CONOCIDA = 'claveConocida';
export const ERROR_ATRIBUTOS_GRANDES = 'atributosGrandes';
/** Error que pone la página con el mensaje de la API (p. ej. CODIGO_DUPLICADO). */
export const ERROR_API = 'api';

export type GrupoAtributos = FormGroup<{
  longitud: FormControl<string>;
  regex: FormControl<string>;
  validaReniec: FormControl<boolean>;
  mascara: FormControl<string>;
  /** Las claves que no son conocidas, como objeto JSON. */
  avanzado: FormControl<string>;
}>;

export type GrupoItem = FormGroup<{
  codigo: FormControl<string>;
  codigoExterno: FormControl<string>;
  nombre: FormControl<string>;
  abreviatura: FormControl<string>;
  orden: FormControl<string>;
  activo: FormControl<boolean>;
  vigenteDesde: FormControl<Date | null>;
  vigenteHasta: FormControl<Date | null>;
  atributos: GrupoAtributos;
}>;

const MENSAJE_POR_ERROR: Readonly<Record<string, string>> = {
  [ERROR_VIGENCIA_INVERTIDA]: MENSAJES_FORMULARIO_ITEM.vigenciaInvertida,
  [ERROR_FECHA_INVALIDA]: MENSAJES_FORMULARIO_ITEM.fechaInvalida,
  [ERROR_REGEX_INVALIDA]: MENSAJES_FORMULARIO_ITEM.regexInvalida,
  [ERROR_ENTERO]: MENSAJES_FORMULARIO_ITEM.enteroInvalido,
  [ERROR_JSON_INVALIDO]: MENSAJES_FORMULARIO_ITEM.jsonInvalido,
  [ERROR_ATRIBUTOS_GRANDES]: MENSAJES_FORMULARIO_ITEM.atributosGrandes,
};

/** `vigenteDesde` empieza hoy en Lima. */
export function crearGrupoItem(): GrupoItem {
  const texto = (...validadores: ValidatorFn[]) => new FormControl('', { nonNullable: true, validators: validadores });
  return new FormGroup({
    codigo: texto(Validators.required, Validators.maxLength(CODIGO_MAXIMO)),
    codigoExterno: texto(Validators.maxLength(CODIGO_EXTERNO_MAXIMO)),
    nombre: texto(Validators.required, Validators.maxLength(NOMBRE_MAXIMO)),
    abreviatura: texto(Validators.maxLength(ABREVIATURA_MAXIMA)),
    orden: texto(validarEntero(ORDEN_MINIMO, ORDEN_MAXIMO)),
    activo: new FormControl(true, { nonNullable: true }),
    vigenteDesde: new FormControl<Date | null>(fechaDesdeIso(hoyEnLima()), { validators: [Validators.required] }),
    vigenteHasta: new FormControl<Date | null>(null, { validators: [validarVigenciaFinal] }),
    atributos: new FormGroup(
      {
        longitud: texto(validarEntero(LONGITUD_MINIMA, LONGITUD_MAXIMA)),
        regex: texto(Validators.maxLength(REGEX_MAXIMA), validarRegex),
        validaReniec: new FormControl(false, { nonNullable: true }),
        mascara: texto(Validators.maxLength(MASCARA_MAXIMA)),
        avanzado: texto(validarJsonAvanzado),
      },
      { validators: [validarTamanoAtributos] },
    ),
  });
}

/** Al cambiar `vigenteDesde` se revalida `vigenteHasta`, que depende de ella. */
export function revalidarVigenciaFinal(grupo: GrupoItem): void {
  grupo.controls.vigenteHasta.updateValueAndValidity({ emitEvent: false });
}

/** Edición: el código no cambia. Las claves desconocidas de los atributos van al JSON avanzado, para no perderlas. */
export function cargarItem(grupo: GrupoItem, item: ItemCatalogo): void {
  const { conocidas, otras } = separarAtributos(item.atributos);
  grupo.reset({
    codigo: item.codigo,
    codigoExterno: item.codigoExterno ?? '',
    nombre: item.nombre,
    abreviatura: item.abreviatura ?? '',
    orden: item.orden === null ? '' : String(item.orden),
    activo: item.activo,
    vigenteDesde: fechaDesdeIso(item.vigenteDesde),
    vigenteHasta: item.vigenteHasta === null ? null : fechaDesdeIso(item.vigenteHasta),
    atributos: {
      longitud: conocidas.longitud === undefined ? '' : String(conocidas.longitud),
      regex: typeof conocidas.regex === 'string' ? conocidas.regex : '',
      validaReniec: conocidas.valida_reniec === true,
      mascara: typeof conocidas.mascara === 'string' ? conocidas.mascara : '',
      avanzado: Object.keys(otras).length === 0 ? '' : JSON.stringify(otras, null, SANGRIA_JSON),
    },
  });
  grupo.controls.codigo.disable();
}

/** La solicitud lista para la API. Sin `codigo` al editar. Solo con el grupo válido. */
export function aSolicitudItem(grupo: GrupoItem): SolicitudItem {
  const valor = grupo.getRawValue();
  const contenido: SolicitudItem = {
    codigoExterno: textoONulo(valor.codigoExterno),
    nombre: valor.nombre.trim(),
    abreviatura: textoONulo(valor.abreviatura),
    orden: valor.orden.trim() === '' ? null : Number(valor.orden),
    atributos: atributosDe(grupo.controls.atributos),
    vigenteDesde: isoDesdeFecha(valor.vigenteDesde as Date),
    vigenteHasta: valor.vigenteHasta === null ? null : isoDesdeFecha(valor.vigenteHasta),
    activo: valor.activo,
  };
  return grupo.controls.codigo.disabled ? contenido : { codigo: valor.codigo.trim(), ...contenido };
}

/** TR-CA-062: YYYY-MM-DD si `vigenteDesde` es posterior a hoy en Lima; null si ya está vigente o no hay fecha. */
export function inicioFuturo(grupo: GrupoItem): string | null {
  const desde = grupo.controls.vigenteDesde.value;
  if (!desde) return null;
  const iso = isoDesdeFecha(desde);
  return iso > hoyEnLima() ? iso : null;
}

/** Mensaje del primer error del campo: el de la API, los propios y luego los genéricos de `shared/ui`. */
export function mensajeDeErrorItem(errores: ValidationErrors | null): string | null {
  if (typeof errores?.[ERROR_API] === 'string') return errores[ERROR_API];
  if (typeof errores?.[ERROR_CLAVE_CONOCIDA] === 'string') return mensajeClaveConocidaEnJson(errores[ERROR_CLAVE_CONOCIDA] as ClaveConocida);
  const propio = Object.keys(errores ?? {}).find((codigo) => MENSAJE_POR_ERROR[codigo]);
  return propio ? MENSAJE_POR_ERROR[propio] : mensajeDeValidacion(errores);
}

function atributosDe(grupo: GrupoAtributos): AtributosItem {
  const valor = grupo.getRawValue();
  const conocidas: Record<string, unknown> = {};
  if (valor.longitud.trim() !== '') conocidas['longitud'] = Number(valor.longitud);
  if (valor.regex.trim() !== '') conocidas['regex'] = valor.regex.trim();
  if (valor.validaReniec) conocidas['valida_reniec'] = true;
  if (valor.mascara.trim() !== '') conocidas['mascara'] = valor.mascara.trim();
  return { ...conocidas, ...(leerJsonAvanzado(valor.avanzado) ?? {}) };
}

function separarAtributos(atributos: AtributosItem): { conocidas: Partial<Record<ClaveConocida, unknown>>; otras: Record<string, unknown> } {
  const conocidas: Partial<Record<ClaveConocida, unknown>> = {};
  const otras: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(atributos)) {
    if (esClaveConocida(clave)) conocidas[clave] = valor;
    else otras[clave] = valor;
  }
  return { conocidas, otras };
}

function esClaveConocida(clave: string): clave is ClaveConocida {
  return (CLAVES_CONOCIDAS as readonly string[]).includes(clave);
}

/** El objeto del JSON avanzado; `{}` si está vacío y null si no es un objeto. */
function leerJsonAvanzado(texto: string): Record<string, unknown> | null {
  if (texto.trim() === '') return {};
  try {
    const valor: unknown = JSON.parse(texto);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function textoONulo(valor: string): string | null {
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

function validarEntero(minimo: number, maximo: number): ValidatorFn {
  return (control: AbstractControl<string>) => {
    const texto = control.value.trim();
    if (texto === '') return null;
    if (!ENTERO.test(texto)) return { [ERROR_ENTERO]: true };
    const numero = Number(texto);
    if (numero < minimo) return { min: { min: minimo } };
    if (numero > maximo) return { max: { max: maximo } };
    return null;
  };
}

function validarRegex(control: AbstractControl<string>): ValidationErrors | null {
  const texto = control.value.trim();
  if (texto === '') return null;
  try {
    new RegExp(texto);
    return null;
  } catch {
    return { [ERROR_REGEX_INVALIDA]: true };
  }
}

function validarJsonAvanzado(control: AbstractControl<string>): ValidationErrors | null {
  const objeto = leerJsonAvanzado(control.value);
  if (objeto === null) return { [ERROR_JSON_INVALIDO]: true };
  const repetida = Object.keys(objeto).find(esClaveConocida);
  return repetida ? { [ERROR_CLAVE_CONOCIDA]: repetida } : null;
}

/** El back acepta hasta 4 KB: se mide el JSON combinado en bytes UTF-8. */
function validarTamanoAtributos(control: AbstractControl): ValidationErrors | null {
  const grupo = control as GrupoAtributos;
  if (grupo.controls.avanzado.invalid) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(atributosDe(grupo))).length;
  return bytes > LIMITE_ATRIBUTOS_BYTES ? { [ERROR_ATRIBUTOS_GRANDES]: true } : null;
}

function validarVigenciaFinal(control: AbstractControl<Date | null>): ValidationErrors | null {
  const hasta = control.value;
  const desde = (control.parent as GrupoItem | null)?.controls.vigenteDesde.value;
  if (!hasta || !desde) return null;
  return isoDesdeFecha(hasta) < isoDesdeFecha(desde) ? { [ERROR_VIGENCIA_INVERTIDA]: true } : null;
}
