import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { TIPO_ALMACEN, type TipoUnidad } from '../models/tipos-unidad';
import type { AltaUnidad, AtributosUnidad, DatosUnidad, Unidad } from '../models/unidad';
import { ERROR_CAPACIDAD_ENTERA, ERROR_SUCURSAL_REQUERIDA, textoONulo } from './validadores-organizacion';

// Los límites de TR-RF-004 que valida la API.
const LONGITUD_MAXIMA_CODIGO = 20;
const LONGITUD_MINIMA_NOMBRE = 3;
const LONGITUD_MAXIMA_NOMBRE = 150;
const LONGITUD_MAXIMA_IMPRESORA = 100;
const LONGITUD_MAXIMA_PISO = 20;
const CAPACIDAD_MINIMA = 0;

/** Las claves de `atributos` que edita la UI; las demás se conservan tal cual (sin esquema hasta el 19a). */
const CLAVES_EDITABLES: readonly (keyof AtributosUnidad)[] = ['impresora', 'capacidad', 'piso'];

export type GrupoUnidad = FormGroup<{
  tipo: FormControl<TipoUnidad | null>;
  /** null: «Sin sucursal (nivel empresa)». */
  sucursalId: FormControl<string | null>;
  codigo: FormControl<string>;
  nombre: FormControl<string>;
  padreId: FormControl<string | null>;
  impresora: FormControl<string>;
  capacidad: FormControl<number | null>;
  piso: FormControl<string>;
}>;

export function crearGrupoUnidad(): GrupoUnidad {
  return new FormGroup(
    {
      tipo: new FormControl<TipoUnidad | null>(null, Validators.required),
      sucursalId: new FormControl<string | null>(null),
      codigo: texto(Validators.required, Validators.maxLength(LONGITUD_MAXIMA_CODIGO)),
      nombre: texto(Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE), Validators.maxLength(LONGITUD_MAXIMA_NOMBRE)),
      padreId: new FormControl<string | null>(null),
      impresora: texto(Validators.maxLength(LONGITUD_MAXIMA_IMPRESORA)),
      capacidad: new FormControl<number | null>(null, [Validators.min(CAPACIDAD_MINIMA), validarEntero]),
      piso: texto(Validators.maxLength(LONGITUD_MAXIMA_PISO)),
    },
    { validators: validarSucursal },
  );
}

/** Edición: tipo y sucursal no cambian (EditarUnidad no los recibe); se muestran en solo lectura. */
export function cargarUnidad(grupo: GrupoUnidad, unidad: Unidad): void {
  const { atributos } = unidad;
  grupo.reset({
    tipo: unidad.tipo,
    sucursalId: unidad.sucursalId,
    codigo: unidad.codigo,
    nombre: unidad.nombre,
    padreId: unidad.padreId,
    impresora: typeof atributos['impresora'] === 'string' ? atributos['impresora'] : '',
    capacidad: typeof atributos['capacidad'] === 'number' ? atributos['capacidad'] : null,
    piso: typeof atributos['piso'] === 'string' ? atributos['piso'] : '',
  });
  grupo.controls.tipo.disable();
  grupo.controls.sucursalId.disable();
}

export function aAltaUnidad(grupo: GrupoUnidad, empresaId: string): AltaUnidad {
  const valor = grupo.getRawValue();
  return { empresaId, sucursalId: valor.sucursalId, tipo: valor.tipo as TipoUnidad, ...aDatosUnidad(grupo, {}) };
}

/** `atributosOriginales`: los de la unidad editada, para no perder claves que la UI no conoce. */
export function aDatosUnidad(grupo: GrupoUnidad, atributosOriginales: Readonly<Record<string, unknown>>): DatosUnidad {
  const valor = grupo.getRawValue();
  const campos: AtributosUnidad = { impresora: textoONulo(valor.impresora) ?? undefined, capacidad: valor.capacidad ?? undefined, piso: textoONulo(valor.piso) ?? undefined };
  return { codigo: valor.codigo.trim(), nombre: valor.nombre.trim(), padreId: valor.padreId, atributos: fusionarAtributos(atributosOriginales, campos) };
}

/** Conserva las claves ajenas a la UI y pone solo los campos con valor. */
export function fusionarAtributos(originales: Readonly<Record<string, unknown>>, campos: AtributosUnidad): Record<string, unknown> {
  const ajenas = Object.fromEntries(Object.entries(originales).filter(([clave]) => !CLAVES_EDITABLES.includes(clave as keyof AtributosUnidad)));
  const conValor = Object.fromEntries(Object.entries(campos).filter(([, valor]) => valor !== undefined));
  return { ...ajenas, ...conValor };
}

/** TR-RN-004 / TR-CA-011: solo el almacén puede quedar a nivel de empresa. */
function validarSucursal(grupo: AbstractControl): ValidationErrors | null {
  const { tipo, sucursalId } = (grupo as GrupoUnidad).getRawValue();
  if (tipo === null || tipo === TIPO_ALMACEN || sucursalId !== null) return null;
  return { [ERROR_SUCURSAL_REQUERIDA]: true };
}

function validarEntero(control: AbstractControl): ValidationErrors | null {
  const capacidad = control.value as number | null;
  return capacidad === null || Number.isInteger(capacidad) ? null : { [ERROR_CAPACIDAD_ENTERA]: true };
}

function texto(...validadores: ((control: AbstractControl) => ValidationErrors | null)[]): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators: validadores });
}
