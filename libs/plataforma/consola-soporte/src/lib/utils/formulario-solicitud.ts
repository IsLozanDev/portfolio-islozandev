import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import { HORAS_SOPORTE, type ModoSoporte, type SolicitudDeAcceso, type TenantElegible } from '../models/acceso-del-agente';

/** Mismos límites que el dominio (spec 18): el error del front se adelanta al de la API. */
export const FORMATO_TICKET = /^SOP-\d{6}$/;
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 300;
export const HORAS_POR_DEFECTO = HORAS_SOPORTE[1];
export const ERROR_TENANT_NO_ELEGIDO = 'tenantNoElegido';

export type GrupoSolicitud = FormGroup<{
  tenant: FormControl<TenantElegible | string>;
  ticket: FormControl<string>;
  motivo: FormControl<string>;
  modo: FormControl<ModoSoporte>;
  horas: FormControl<number>;
}>;

/** El campo de tenant tiene el texto que se escribe hasta que se elige una opción del autocompletar. */
function tenantElegido(control: AbstractControl<TenantElegible | string>): ValidationErrors | null {
  return typeof control.value === 'object' && control.value !== null ? null : { [ERROR_TENANT_NO_ELEGIDO]: true };
}

export function crearGrupoSolicitud(): GrupoSolicitud {
  return new FormGroup({
    tenant: new FormControl<TenantElegible | string>('', { nonNullable: true, validators: [tenantElegido] }),
    ticket: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(FORMATO_TICKET)] }),
    motivo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(MOTIVO_MINIMO), Validators.maxLength(MOTIVO_MAXIMO)],
    }),
    modo: new FormControl<ModoSoporte>('LECTURA', { nonNullable: true }),
    horas: new FormControl<number>(HORAS_POR_DEFECTO, { nonNullable: true }),
  });
}

/** Solo con el grupo válido: el tenant ya es una opción elegida. */
export function aSolicitudDeAcceso(grupo: GrupoSolicitud): SolicitudDeAcceso {
  const valor = grupo.getRawValue();
  const tenant = valor.tenant as TenantElegible;
  return { tenantId: tenant.id, ticket: valor.ticket.trim().toUpperCase(), motivo: valor.motivo.trim(), modo: valor.modo, horas: valor.horas };
}

export function nombreDeTenant(tenant: TenantElegible | string | null): string {
  if (!tenant) return '';
  return typeof tenant === 'string' ? tenant : `${tenant.nombre} (${tenant.codigo})`;
}
