import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { mensajeDeValidacion } from '@vitrina/shared/ui';
import type { AlcanceCatalogo, CambiosCatalogo, Catalogo, SolicitudCatalogo } from '../models/catalogo';
import { MENSAJES_FORMULARIO_CATALOGO } from '../models/mensajes-catalogos';

// Las reglas de TR-RF-022 que valida el dominio (19a).
const FORMATO_CODIGO = /^[A-Z][A-Z0-9_]{2,59}$/;
const NOMBRE_MINIMO = 3;
const NOMBRE_MAXIMO = 150;
const FUENTE_MAXIMA = 150;
const ALCANCE_POR_DEFECTO: AlcanceCatalogo = 'MIXTO';

export const ERROR_CODIGO_FORMATO = 'codigoCatalogoFormato';
export const ERROR_NOMBRE_LONGITUD = 'nombreCatalogoLongitud';
/** Error que pone la página con el mensaje de la API (p. ej. CATALOGO_DUPLICADO). */
export const ERROR_API = 'api';

export type GrupoCatalogo = FormGroup<{
  codigo: FormControl<string>;
  nombre: FormControl<string>;
  alcance: FormControl<AlcanceCatalogo>;
  fuente: FormControl<string>;
  editablePorTenant: FormControl<boolean>;
}>;

const MENSAJE_POR_ERROR: Readonly<Record<string, string>> = {
  [ERROR_CODIGO_FORMATO]: MENSAJES_FORMULARIO_CATALOGO.codigoFormato,
  [ERROR_NOMBRE_LONGITUD]: MENSAJES_FORMULARIO_CATALOGO.nombreLongitud,
};

export function crearGrupoCatalogo(): GrupoCatalogo {
  const grupo: GrupoCatalogo = new FormGroup({
    codigo: new FormControl('', { nonNullable: true, validators: [Validators.required, validarCodigo] }),
    nombre: new FormControl('', { nonNullable: true, validators: [Validators.required, validarNombre] }),
    alcance: new FormControl<AlcanceCatalogo>(ALCANCE_POR_DEFECTO, { nonNullable: true }),
    fuente: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(FUENTE_MAXIMA)] }),
    editablePorTenant: new FormControl(true, { nonNullable: true }),
  });
  ajustarEditable(grupo, ALCANCE_POR_DEFECTO);
  return grupo;
}

/** TR-CA-059 en el cliente: GLOBAL nunca editable; MIXTO y TENANT siempre. El control queda derivado del alcance. */
export function mantenerCoherenciaEditable(grupo: GrupoCatalogo, destruir: DestroyRef): void {
  grupo.controls.alcance.valueChanges.pipe(takeUntilDestroyed(destruir)).subscribe((alcance) => ajustarEditable(grupo, alcance));
}

/** Edición: el código y el alcance no cambian después de crear. */
export function cargarCatalogo(grupo: GrupoCatalogo, catalogo: Catalogo): void {
  grupo.reset({
    codigo: catalogo.codigo,
    nombre: catalogo.nombre,
    alcance: catalogo.alcance,
    fuente: catalogo.fuente ?? '',
    editablePorTenant: catalogo.editablePorTenant,
  });
  grupo.controls.codigo.disable();
  grupo.controls.alcance.disable();
  ajustarEditable(grupo, catalogo.alcance);
}

export function aSolicitudCatalogo(grupo: GrupoCatalogo): SolicitudCatalogo {
  const valor = grupo.getRawValue();
  return { codigo: valor.codigo.trim(), alcance: valor.alcance, ...aCambiosCatalogo(grupo) };
}

export function aCambiosCatalogo(grupo: GrupoCatalogo): CambiosCatalogo {
  const valor = grupo.getRawValue();
  const fuente = valor.fuente.trim();
  return { nombre: valor.nombre.trim(), fuente: fuente === '' ? null : fuente, editablePorTenant: valor.editablePorTenant };
}

/** Mensaje del primer error del campo: los propios, el de la API y luego los genéricos de `shared/ui`. */
export function mensajeDeErrorCatalogo(errores: ValidationErrors | null): string | null {
  if (typeof errores?.[ERROR_API] === 'string') return errores[ERROR_API];
  const propio = Object.keys(errores ?? {}).find((codigo) => MENSAJE_POR_ERROR[codigo]);
  return propio ? MENSAJE_POR_ERROR[propio] : mensajeDeValidacion(errores);
}

function ajustarEditable(grupo: GrupoCatalogo, alcance: AlcanceCatalogo): void {
  const editable = grupo.controls.editablePorTenant;
  editable.setValue(alcance !== 'GLOBAL', { emitEvent: false });
  editable.disable({ emitEvent: false });
}

function validarCodigo(control: AbstractControl<string>): ValidationErrors | null {
  const codigo = control.value.trim();
  return codigo === '' || FORMATO_CODIGO.test(codigo) ? null : { [ERROR_CODIGO_FORMATO]: true };
}

function validarNombre(control: AbstractControl<string>): ValidationErrors | null {
  const longitud = control.value.trim().length;
  return longitud === 0 || (longitud >= NOMBRE_MINIMO && longitud <= NOMBRE_MAXIMO) ? null : { [ERROR_NOMBRE_LONGITUD]: true };
}
