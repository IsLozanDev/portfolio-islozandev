import { FormControl, FormGroup, Validators, type ValidatorFn } from '@angular/forms';
import type { CargaConfigurarEmisor, Emisor, RegimenIgv } from '../models/emisor';
import type { ProveedorFe } from '../models/proveedor-fe';

// Los límites de la API (`EsquemaConfigurar` y el dominio).
const LONGITUD_MAXIMA_USUARIO = 100;
const LONGITUD_MAXIMA_CLAVE = 200;
const LONGITUD_MAXIMA_URL = 255;
const LONGITUD_MAXIMA_LEYENDA = 300;
const REGIMEN_POR_DEFECTO: RegimenIgv = 'GENERAL';

export type GrupoProveedor = FormGroup<{
  proveedor: FormControl<string>;
  usuario: FormControl<string>;
  /** Nunca se rellena: vacío conserva la guardada (TR-RNF-113). */
  clave: FormControl<string>;
  url: FormControl<string>;
  regimenIgv: FormControl<RegimenIgv>;
  leyendaPie: FormControl<string>;
}>;

function campo(inicial: string, ...validadores: ValidatorFn[]): FormControl<string> {
  return new FormControl(inicial, { nonNullable: true, validators: validadores });
}

export function crearGrupoProveedor(): GrupoProveedor {
  return new FormGroup({
    proveedor: campo('', Validators.required),
    usuario: campo('', Validators.required, Validators.maxLength(LONGITUD_MAXIMA_USUARIO)),
    clave: campo('', Validators.maxLength(LONGITUD_MAXIMA_CLAVE)),
    url: campo('', Validators.maxLength(LONGITUD_MAXIMA_URL)),
    regimenIgv: new FormControl<RegimenIgv>(REGIMEN_POR_DEFECTO, { nonNullable: true }),
    leyendaPie: campo('', Validators.maxLength(LONGITUD_MAXIMA_LEYENDA)),
  });
}

/** Los datos del emisor, sin clave. En PRODUCCION el proveedor y la URL no se editan. */
export function cargarEmisor(grupo: GrupoProveedor, emisor: Emisor | null): void {
  grupo.reset({
    proveedor: emisor?.proveedor ?? '',
    usuario: emisor?.usuarioProveedor ?? '',
    clave: '',
    url: emisor?.urlProveedor ?? '',
    regimenIgv: emisor?.regimenIgv ?? REGIMEN_POR_DEFECTO,
    leyendaPie: emisor?.leyendaPie ?? '',
  });
  const enProduccion = emisor?.estado === 'PRODUCCION';
  for (const control of [grupo.controls.proveedor, grupo.controls.url]) {
    if (enProduccion) control.disable();
    else control.enable();
  }
}

/** La URL es obligatoria solo si el proveedor la pide (spec 51c). */
export function exigirUrlSegun(grupo: GrupoProveedor, proveedor: ProveedorFe | null): void {
  const url = grupo.controls.url;
  if (proveedor?.pideUrl) url.addValidators(Validators.required);
  else url.removeValidators(Validators.required);
  url.updateValueAndValidity();
}

function textoONulo(valor: string): string | null {
  const recortado = valor.trim();
  return recortado === '' ? null : recortado;
}

/** `clave` solo si se escribió; `url_proveedor` solo si el proveedor la pide; `version` si el emisor ya existe. */
export function aCargaConfigurar(grupo: GrupoProveedor, proveedor: ProveedorFe | null, emisor: Emisor | null): CargaConfigurarEmisor {
  const valor = grupo.getRawValue();
  const clave = valor.clave.trim();
  return {
    proveedor: valor.proveedor,
    usuario_proveedor: valor.usuario.trim(),
    ...(clave ? { clave } : {}),
    regimen_igv: valor.regimenIgv,
    leyenda_pie: textoONulo(valor.leyendaPie),
    ...(proveedor?.pideUrl ? { url_proveedor: textoONulo(valor.url) } : {}),
    ...(emisor ? { version: emisor.version } : {}),
  };
}
