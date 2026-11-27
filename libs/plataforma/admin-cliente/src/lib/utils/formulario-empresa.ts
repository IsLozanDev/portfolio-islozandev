import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { ubigeoElegido, type ValorUbigeo } from '@vitrina/plataforma/personas-ui';
import { telefonoPeru } from '@vitrina/shared/ui';
import type { DatosEdicionEmpresa, DatosEmpresa, Empresa } from '../models/empresa';
import { validarRuc } from './ruc';
import { campoDeTexto, codigoDeUbigeo, ERROR_RUC_INVALIDO, textoONulo, validarSitioWeb } from './validadores-organizacion';

// Los límites de TR-RF-002 y del spec 17d que valida la API.
const LONGITUD_MAXIMA_RAZON_SOCIAL = 200;
const LONGITUD_MAXIMA_NOMBRE_COMERCIAL = 150;
const LONGITUD_MAXIMA_DIRECCION = 250;
const LONGITUD_MAXIMA_CORREO = 254;
const LONGITUD_MAXIMA_SITIO_WEB = 200;

export type GrupoEmpresa = FormGroup<{
  ruc: FormControl<string>;
  razonSocial: FormControl<string>;
  nombreComercial: FormControl<string>;
  direccionFiscal: FormControl<string>;
  /** El distrito elegido del catálogo; un texto sin elegir no deja guardar. Con el campo deshabilitado, el código guardado. */
  ubigeo: FormControl<ValorUbigeo>;
  /** E.164 que entrega `vitTelefono`, o el texto incompleto que marca `telefonoPeru`. */
  telefono: FormControl<string | null>;
  correo: FormControl<string>;
  sitioWeb: FormControl<string>;
  /** Solo en la edición: el subido queda pendiente hasta «Guardar cambios». */
  logoArchivoId: FormControl<string | null>;
}>;

export function crearGrupoEmpresa(): GrupoEmpresa {
  return new FormGroup({
    ruc: campoDeTexto('', Validators.required, validarRucDelControl),
    razonSocial: campoDeTexto('', Validators.required, Validators.maxLength(LONGITUD_MAXIMA_RAZON_SOCIAL)),
    nombreComercial: campoDeTexto('', Validators.maxLength(LONGITUD_MAXIMA_NOMBRE_COMERCIAL)),
    direccionFiscal: campoDeTexto('', Validators.maxLength(LONGITUD_MAXIMA_DIRECCION)),
    ubigeo: new FormControl<ValorUbigeo>(null, ubigeoElegido),
    telefono: new FormControl<string | null>(null, telefonoPeru),
    correo: campoDeTexto('', Validators.email, Validators.maxLength(LONGITUD_MAXIMA_CORREO)),
    sitioWeb: campoDeTexto('', validarSitioWeb, Validators.maxLength(LONGITUD_MAXIMA_SITIO_WEB)),
    logoArchivoId: new FormControl<string | null>(null),
  });
}

/**
 * Edición: el RUC identifica a la empresa y no cambia. `ubigeo` es el distrito del catálogo que corresponde al
 * código guardado, o el código como texto si el catálogo no está.
 */
export function cargarEmpresa(grupo: GrupoEmpresa, empresa: Empresa, ubigeo: ValorUbigeo): void {
  grupo.reset({
    ruc: empresa.ruc,
    razonSocial: empresa.razonSocial,
    nombreComercial: empresa.nombreComercial ?? '',
    direccionFiscal: empresa.direccionFiscal ?? '',
    ubigeo,
    telefono: empresa.telefono,
    correo: empresa.correo ?? '',
    sitioWeb: empresa.sitioWeb ?? '',
    logoArchivoId: empresa.logoArchivoId,
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
    ubigeo: codigoDeUbigeo(valor.ubigeo),
    telefono: valor.telefono,
    correo: textoONulo(valor.correo)?.toLowerCase() ?? null,
    sitioWeb: textoONulo(valor.sitioWeb),
  };
}

export function aDatosEdicionEmpresa(grupo: GrupoEmpresa): DatosEdicionEmpresa {
  return { ...aDatosEmpresa(grupo), logoArchivoId: grupo.getRawValue().logoArchivoId };
}

/** TR-RN-002 en el cliente: 11 dígitos y dígito verificador (módulo 11). El servidor repite. */
function validarRucDelControl(control: AbstractControl): ValidationErrors | null {
  const ruc = (control.value as string).trim();
  return ruc === '' || validarRuc(ruc) ? null : { [ERROR_RUC_INVALIDO]: true };
}
