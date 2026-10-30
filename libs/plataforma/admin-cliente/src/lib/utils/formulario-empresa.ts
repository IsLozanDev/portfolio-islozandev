import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import type { DatosEmpresa, Empresa } from '../models/empresa';
import { validarRuc } from './ruc';
import { ERROR_RUC_INVALIDO, textoONulo, validarUbigeo } from './validadores-organizacion';

// Los límites de TR-RF-002 que valida la API.
const LONGITUD_MAXIMA_RAZON_SOCIAL = 200;
const LONGITUD_MAXIMA_NOMBRE_COMERCIAL = 150;
const LONGITUD_MAXIMA_DIRECCION = 250;

export type GrupoEmpresa = FormGroup<{
  ruc: FormControl<string>;
  razonSocial: FormControl<string>;
  nombreComercial: FormControl<string>;
  direccionFiscal: FormControl<string>;
  ubigeo: FormControl<string>;
}>;

export function crearGrupoEmpresa(): GrupoEmpresa {
  return new FormGroup({
    ruc: texto(Validators.required, validarRucDelControl),
    razonSocial: texto(Validators.required, Validators.maxLength(LONGITUD_MAXIMA_RAZON_SOCIAL)),
    nombreComercial: texto(Validators.maxLength(LONGITUD_MAXIMA_NOMBRE_COMERCIAL)),
    direccionFiscal: texto(Validators.maxLength(LONGITUD_MAXIMA_DIRECCION)),
    ubigeo: texto(validarUbigeo),
  });
}

/** Edición: el RUC identifica a la empresa y no cambia. */
export function cargarEmpresa(grupo: GrupoEmpresa, empresa: Empresa): void {
  grupo.reset({
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial ?? '',
    direccionFiscal: empresa.direccionFiscal ?? '',
    ubigeo: empresa.ubigeo ?? '',
  });
  grupo.controls.ruc.disable();
}

export function rucDe(grupo: GrupoEmpresa): string {
  return grupo.getRawValue().ruc.trim();
}

export function aDatosEmpresa(grupo: GrupoEmpresa): DatosEmpresa {
  const valor = grupo.getRawValue();
  return {
    razonSocial: valor.razonSocial.trim(),
    nombreComercial: textoONulo(valor.nombreComercial),
    direccionFiscal: textoONulo(valor.direccionFiscal),
    ubigeo: textoONulo(valor.ubigeo),
  };
}

/** TR-RN-002 en el cliente: 11 dígitos y dígito verificador (módulo 11). El servidor repite. */
function validarRucDelControl(control: AbstractControl): ValidationErrors | null {
  const ruc = (control.value as string).trim();
  return ruc === '' || validarRuc(ruc) ? null : { [ERROR_RUC_INVALIDO]: true };
}

function texto(...validadores: ((control: AbstractControl) => ValidationErrors | null)[]): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators: validadores });
}
