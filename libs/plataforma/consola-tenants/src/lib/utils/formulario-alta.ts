import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors, type ValidatorFn } from '@angular/forms';
import { mensajeDeValidacion } from '@vitrina/shared/ui';
import { validarRuc } from './ruc';
import type { Modalidad, Plan, ProductoCodigo } from '../models/catalogos';
import type { SolicitudAltaTenant } from '../models/alta-tenant';
import { MENSAJES_ALTA } from '../models/mensajes-consola';

// Cotas de `POST /v1/org/tenants` (spec 12).
const CODIGO_TENANT = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LONGITUD_MINIMA_CODIGO = 3;
const LONGITUD_MAXIMA_CODIGO = 30;
const LONGITUD_MINIMA_NOMBRE = 3;
const LONGITUD_MAXIMA_NOMBRE = 150;
const LONGITUD_MAXIMA_RAZON_SOCIAL = 200;
const LONGITUD_MAXIMA_NOMBRE_COMERCIAL = 150;
const LONGITUD_MAXIMA_CORREO = 255;
const MODALIDAD_POR_DEFECTO: Modalidad = 'PRUEBA';
const MODALIDAD_CON_VIGENCIA: Modalidad = 'ACTIVO';

export const ERROR_CODIGO_FORMATO = 'codigoFormato';
export const ERROR_RUC_INVALIDO = 'rucInvalido';
/** Error que pone la página con el `mensaje` de la API (p. ej. código duplicado). */
export const ERROR_SERVIDOR = 'servidor';

export type GrupoTenant = FormGroup<{
  codigo: FormControl<string>;
  nombre: FormControl<string>;
  productoCodigo: FormControl<ProductoCodigo | null>;
  plan: FormControl<Plan | null>;
  modalidad: FormControl<Modalidad>;
  vigenteHasta: FormControl<Date | null>;
}>;

export type GrupoEmpresa = FormGroup<{
  ruc: FormControl<string>;
  razonSocial: FormControl<string>;
  nombreComercial: FormControl<string>;
  correoPropietario: FormControl<string>;
  nombrePropietario: FormControl<string>;
}>;

export type FormularioAlta = FormGroup<{ tenant: GrupoTenant; empresa: GrupoEmpresa }>;
export type ValorFormularioAlta = ReturnType<FormularioAlta['getRawValue']>;

export function crearFormularioAlta(): FormularioAlta {
  return new FormGroup({
    tenant: new FormGroup({
      codigo: controlDeTexto(Validators.required, Validators.minLength(LONGITUD_MINIMA_CODIGO), Validators.maxLength(LONGITUD_MAXIMA_CODIGO), validarCodigo),
      nombre: controlDeTexto(Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE), Validators.maxLength(LONGITUD_MAXIMA_NOMBRE)),
      productoCodigo: new FormControl<ProductoCodigo | null>(null, Validators.required),
      plan: new FormControl<Plan | null>(null, Validators.required),
      modalidad: new FormControl<Modalidad>(MODALIDAD_POR_DEFECTO, { nonNullable: true }),
      vigenteHasta: new FormControl<Date | null>(null),
    }),
    empresa: new FormGroup({
      ruc: controlDeTexto(Validators.required, validarRucDelControl),
      razonSocial: controlDeTexto(Validators.required, Validators.maxLength(LONGITUD_MAXIMA_RAZON_SOCIAL)),
      nombreComercial: controlDeTexto(Validators.maxLength(LONGITUD_MAXIMA_NOMBRE_COMERCIAL)),
      correoPropietario: controlDeTexto(Validators.required, Validators.email, Validators.maxLength(LONGITUD_MAXIMA_CORREO)),
      nombrePropietario: controlDeTexto(Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE), Validators.maxLength(LONGITUD_MAXIMA_NOMBRE)),
    }),
  });
}

/**
 * La API exige `vigente_hasta` solo en modalidad ACTIVO. Se pone o se quita `Validators.required` en el
 * control (no el atributo `required` del input: su validador queda pegado al control al ocultarlo).
 */
export function aplicarModalidad(grupo: GrupoTenant): void {
  const { modalidad, vigenteHasta } = grupo.controls;
  if (modalidad.value === MODALIDAD_CON_VIGENCIA) vigenteHasta.addValidators(Validators.required);
  else vigenteHasta.removeValidators(Validators.required);
  vigenteHasta.updateValueAndValidity();
}

/** Mensaje del primer error del campo: los propios del alta y luego los genéricos de `shared/ui`. */
export function mensajeDeError(errores: ValidationErrors | null): string | null {
  if (errores?.[ERROR_SERVIDOR]) return errores[ERROR_SERVIDOR] as string;
  if (errores?.[ERROR_CODIGO_FORMATO]) return MENSAJES_ALTA.codigoFormato;
  if (errores?.[ERROR_RUC_INVALIDO]) return MENSAJES_ALTA.rucInvalido;
  return mensajeDeValidacion(errores);
}

export function aSolicitudAlta(valor: ValorFormularioAlta): SolicitudAltaTenant {
  const { tenant, empresa } = valor;
  const conVigencia = tenant.modalidad === MODALIDAD_CON_VIGENCIA && tenant.vigenteHasta;
  return {
    codigo: tenant.codigo.trim(),
    nombre: tenant.nombre.trim(),
    productoCodigo: tenant.productoCodigo as ProductoCodigo,
    plan: tenant.plan as Plan,
    modalidad: tenant.modalidad,
    vigenteHasta: conVigencia ? fechaCalendario(tenant.vigenteHasta as Date) : undefined,
    ruc: empresa.ruc.trim(),
    razonSocial: empresa.razonSocial.trim(),
    nombreComercial: empresa.nombreComercial.trim() || undefined,
    correoPropietario: empresa.correoPropietario.trim(),
    nombrePropietario: empresa.nombrePropietario.trim(),
  };
}

/** `YYYY-MM-DD` del día que eligió el usuario en el calendario (sin pasar por UTC). */
export function fechaCalendario(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function validarCodigo(control: AbstractControl): ValidationErrors | null {
  const codigo = control.value as string;
  return codigo === '' || CODIGO_TENANT.test(codigo) ? null : { [ERROR_CODIGO_FORMATO]: true };
}

/** TR-RN-002 en el cliente: 11 dígitos y dígito verificador (módulo 11). El servidor repite. */
function validarRucDelControl(control: AbstractControl): ValidationErrors | null {
  const ruc = (control.value as string).trim();
  return ruc === '' || validarRuc(ruc) ? null : { [ERROR_RUC_INVALIDO]: true };
}


function controlDeTexto(...validadores: ValidatorFn[]): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators: validadores });
}
