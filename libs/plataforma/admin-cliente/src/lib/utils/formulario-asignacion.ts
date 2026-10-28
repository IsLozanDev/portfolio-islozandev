import { FormControl, FormGroup, Validators, type AbstractControl, type ValidationErrors } from '@angular/forms';
import type { Alcance, FormularioAsignacion } from '../models/asignacion';

/** El selector de rol o perfil guarda uno solo: `rol:<id>` o `perfil:<id>` (TR-RN-008, TR-CA-037). */
export const PREFIJO_ROL = 'rol:';
export const PREFIJO_PERFIL = 'perfil:';
export const ERROR_VIGENCIA_INVALIDA = 'vigenciaInvalida';
export const ERROR_UBICACION_REQUERIDA = 'ubicacionRequerida';
const ALCANCE_POR_DEFECTO: Alcance = 'SUCURSAL';

/** Qué ubicación pide cada alcance; las demás van nulas (TR-RN-008). */
export const UBICACION_DEL_ALCANCE: Readonly<Record<Alcance, 'empresaId' | 'sucursalId' | 'unidadId' | null>> = {
  TENANT: null,
  EMPRESA: 'empresaId',
  SUCURSAL: 'sucursalId',
  UNIDAD: 'unidadId',
};

export type GrupoAsignacion = FormGroup<{
  asignable: FormControl<string | null>;
  alcance: FormControl<Alcance>;
  empresaId: FormControl<string | null>;
  sucursalId: FormControl<string | null>;
  unidadId: FormControl<string | null>;
  vigenteDesde: FormControl<Date | null>;
  vigenteHasta: FormControl<Date | null>;
}>;

export function crearGrupoAsignacion(): GrupoAsignacion {
  return new FormGroup(
    {
      asignable: new FormControl<string | null>(null, Validators.required),
      alcance: new FormControl<Alcance>(ALCANCE_POR_DEFECTO, { nonNullable: true }),
      empresaId: new FormControl<string | null>(null),
      sucursalId: new FormControl<string | null>(null),
      unidadId: new FormControl<string | null>(null),
      vigenteDesde: new FormControl<Date | null>(null),
      vigenteHasta: new FormControl<Date | null>(null),
    },
    { validators: [validarUbicacion, validarVigencia] },
  );
}

/** TR-CA-038: «La vigencia hasta no puede ser anterior a la vigencia desde». Sin desde, la API usa hoy. */
function validarVigencia(grupo: AbstractControl): ValidationErrors | null {
  const { vigenteDesde, vigenteHasta } = (grupo as GrupoAsignacion).getRawValue();
  const desde = vigenteDesde ? fechaCalendario(vigenteDesde) : fechaCalendario(new Date());
  if (!vigenteHasta || fechaCalendario(vigenteHasta) >= desde) return null;
  return { [ERROR_VIGENCIA_INVALIDA]: true };
}

function validarUbicacion(grupo: AbstractControl): ValidationErrors | null {
  const valor = (grupo as GrupoAsignacion).getRawValue();
  const requerida = UBICACION_DEL_ALCANCE[valor.alcance];
  return requerida === null || valor[requerida] ? null : { [ERROR_UBICACION_REQUERIDA]: true };
}

/** `YYYY-MM-DD` del día que eligió el usuario en el calendario (sin pasar por UTC). */
export function fechaCalendario(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function aFormularioAsignacion(grupo: GrupoAsignacion): FormularioAsignacion {
  const valor = grupo.getRawValue();
  const ubicacion = UBICACION_DEL_ALCANCE[valor.alcance];
  const idDe = (campo: 'empresaId' | 'sucursalId' | 'unidadId') => (campo === ubicacion ? valor[campo] : null);
  return {
    rolId: idConPrefijo(valor.asignable, PREFIJO_ROL),
    perfilId: idConPrefijo(valor.asignable, PREFIJO_PERFIL),
    alcance: valor.alcance,
    empresaId: idDe('empresaId'),
    sucursalId: idDe('sucursalId'),
    unidadId: idDe('unidadId'),
    vigenteDesde: valor.vigenteDesde ? fechaCalendario(valor.vigenteDesde) : null,
    vigenteHasta: valor.vigenteHasta ? fechaCalendario(valor.vigenteHasta) : null,
  };
}

function idConPrefijo(asignable: string | null, prefijo: string): string | null {
  return asignable?.startsWith(prefijo) ? asignable.slice(prefijo.length) : null;
}
