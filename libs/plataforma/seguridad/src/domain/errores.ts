import { ConflictError, DomainError, ValidationError } from '@vitrina/plataforma/kernel';

/** El motivo es solo para el log; la respuesta HTTP no lo expone. */
export class TokenInvalidoError extends DomainError {
  readonly code = 'TOKEN_INVALIDO';

  constructor(readonly motivo: string) {
    super(`Token inválido: ${motivo}`);
  }
}

export class MfaRequeridaError extends DomainError {
  readonly code = 'MFA_REQUERIDA';

  constructor(readonly maxEdadSeg: number) {
    super(`Se requiere MFA de ${maxEdadSeg} s como máximo`);
  }
}

export class AutenticacionNoDisponibleError extends DomainError {
  readonly code = 'AUTENTICACION_NO_DISPONIBLE';

  constructor() {
    super('No se pudo obtener el JWKS del proveedor de identidad');
  }
}

// Asignaciones (TR-RN-008). Los mensajes son los del SRS.

export class RolOPerfilError extends ValidationError {
  override readonly code = 'ASIGNACION_ROL_O_PERFIL';

  constructor() {
    super('Seleccione un rol o un perfil, no ambos');
  }
}

export class VigenciaInvalidaError extends ValidationError {
  override readonly code = 'VIGENCIA_INVALIDA';

  constructor() {
    super('La vigencia hasta no puede ser anterior a la vigencia desde');
  }
}

export class AlcanceIncoherenteError extends ValidationError {
  override readonly code = 'ALCANCE_INCOHERENTE';

  constructor(alcance: string) {
    super(`El alcance ${alcance} no corresponde a la empresa, sucursal o unidad indicadas`);
  }
}

export class AlcanceInsuficienteError extends ValidationError {
  override readonly code = 'ALCANCE_INSUFICIENTE';

  constructor(readonly permisos: readonly string[]) {
    super(`El alcance es menor que el alcance mínimo de: ${permisos.join(', ')}`);
  }
}

// Roles y perfiles (TR-RF-011, TR-RF-012).

export class RolPredefinidoNoEditableError extends ConflictError {
  override readonly code = 'ROL_PREDEFINIDO_NO_EDITABLE';

  constructor() {
    super('Los roles predefinidos no se editan; cree una copia');
  }
}

export class PerfilPredefinidoNoEditableError extends ConflictError {
  override readonly code = 'PERFIL_PREDEFINIDO_NO_EDITABLE';

  constructor() {
    super('Los perfiles predefinidos no se editan; cree una copia');
  }
}

export class PermisoAjenoAlProductoError extends ValidationError {
  override readonly code = 'PERMISO_AJENO_AL_PRODUCTO';

  constructor(readonly codigos: readonly string[]) {
    super(`Permisos de otro producto, inexistentes u obsoletos: ${codigos.join(', ')}`);
  }
}

export class ProductoNoContratadoError extends ValidationError {
  override readonly code = 'PRODUCTO_NO_CONTRATADO';

  constructor(readonly producto: string) {
    super(`El tenant no tiene suscripción vigente al producto ${producto}`);
  }
}

// Manifiesto (TR-RF-008).

/** Rechaza el manifiesto completo. Cada detalle lleva su ruta, p. ej. `permisos[3].codigo: rest-caja-cerrar`. */
export class ManifiestoInvalidoError extends ValidationError {
  override readonly code = 'MANIFIESTO_INVALIDO';

  constructor(readonly detalles: readonly string[]) {
    super(`Manifiesto inválido: ${detalles.join('; ')}`);
  }
}

export class ManifiestoVersionAlteradaError extends ConflictError {
  override readonly code = 'MANIFIESTO_VERSION_ALTERADA';

  constructor(producto: string, version: string) {
    super(`La versión ${version} de ${producto} ya se aplicó con otro contenido`);
  }
}

export class ManifiestoVersionAnteriorError extends ConflictError {
  override readonly code = 'MANIFIESTO_VERSION_ANTERIOR';

  constructor(producto: string, version: string, vigente: string) {
    super(`La versión ${version} de ${producto} es anterior a la vigente ${vigente}`);
  }
}
