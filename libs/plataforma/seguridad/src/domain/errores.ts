import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

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

// Otorgamiento (TR-RF-013).

export class OtorganteSinAlcanceError extends ForbiddenError {
  override readonly code = 'OTORGANTE_SIN_ALCANCE';

  constructor() {
    super('El otorgante no tiene un alcance igual o mayor sobre el destino');
  }
}

export class MembresiaNoAsignableError extends ConflictError {
  override readonly code = 'MEMBRESIA_NO_ASIGNABLE';

  constructor(estado: string) {
    super(`La membresía está ${estado}: solo se asigna a una membresía ACTIVO o INVITADO`);
  }
}

// Permisos efectivos (TR-RF-015, TR-RF-016).

export class SucursalNoAsignadaError extends ForbiddenError {
  override readonly code = 'SUCURSAL_NO_ASIGNADA';

  constructor() {
    super('No tiene acceso vigente a la sucursal indicada');
  }
}

// Membresías (TR-RF-009, TR-RF-010, TR-RF-014). Los mensajes entre comillas son los del SRS.

export class AlcanceSuperiorError extends ForbiddenError {
  override readonly code = 'ALCANCE_SUPERIOR';

  constructor() {
    super('No puede otorgar un alcance mayor al suyo');
  }
}

export class LimiteUsuariosError extends ConflictError {
  override readonly code = 'LIMITE_USUARIOS';

  constructor(
    readonly producto: string,
    readonly limite: number,
  ) {
    super(`El plan de ${producto} permite ${limite} usuarios`);
  }
}

export class MembresiaExistenteError extends ConflictError {
  override readonly code = 'MEMBRESIA_EXISTENTE';

  constructor(readonly estado: string) {
    super(`El usuario ya es miembro del tenant (${estado})`);
  }
}

export class InvitacionNoEncontradaError extends NotFoundError {
  override readonly code = 'INVITACION_NO_ENCONTRADA';

  constructor() {
    super('La invitación no existe');
  }
}

/** HTTP 410: la interfaz lo distingue de los demás ConflictError. */
export class InvitacionExpiradaError extends ConflictError {
  override readonly code = 'INVITACION_EXPIRADA';

  constructor() {
    super('La invitación expiró; solicite una nueva al administrador');
  }
}

export class InvitacionNoDisponibleError extends ConflictError {
  override readonly code = 'INVITACION_NO_DISPONIBLE';

  constructor(readonly estado: string) {
    super(`La invitación ya no está disponible (${estado})`);
  }
}

export class InvitacionOtroCorreoError extends ForbiddenError {
  override readonly code = 'INVITACION_OTRO_CORREO';

  constructor() {
    super('Esta invitación pertenece a otro correo');
  }
}

export class TransicionMembresiaError extends ConflictError {
  override readonly code = 'TRANSICION_INVALIDA';

  constructor(
    readonly estado: string,
    readonly accion: string,
  ) {
    super(`No se puede ${accion} una membresía ${estado}`);
  }
}

export class PropietarioUnicoError extends ConflictError {
  override readonly code = 'PROPIETARIO_UNICO';

  constructor() {
    super('El tenant debe tener al menos un propietario activo');
  }
}

export class AsignacionYaRevocadaError extends ConflictError {
  override readonly code = 'ASIGNACION_YA_REVOCADA';

  constructor() {
    super('La asignación ya estaba revocada');
  }
}

export class MotivoInvalidoError extends ValidationError {
  override readonly code = 'MOTIVO_INVALIDO';

  constructor() {
    super('El motivo debe tener entre 4 y 300 caracteres');
  }
}

/** TR-RNF-021: las acciones destructivas exigen `confirmar: true`. */
export class ConfirmacionRequeridaError extends ValidationError {
  override readonly code = 'CONFIRMACION_REQUERIDA';

  constructor() {
    super('La acción exige confirmación explícita');
  }
}
