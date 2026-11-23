import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';

// Ningún mensaje lleva la clave del proveedor, la clave del certificado ni bytes del .pfx: los mensajes
// llegan a logs y respuestas (TR-RNF-026).

export class EmisorNoEncontradoError extends NotFoundError {
  override readonly code = 'EMISOR_NO_ENCONTRADO';

  constructor() {
    super('La empresa no tiene emisor electrónico configurado');
  }
}

/** También si la empresa es de otro tenant: la RLS no la deja ver (404, no 403). */
export class EmpresaNoEncontradaError extends NotFoundError {
  override readonly code = 'EMPRESA_NO_ENCONTRADA';

  constructor() {
    super('La empresa no existe');
  }
}

export class EmpresaInactivaError extends ConflictError {
  override readonly code = 'EMPRESA_INACTIVA';

  constructor() {
    super('La empresa está inactiva');
  }
}

export class ProveedorFeInvalidoError extends ValidationError {
  override readonly code = 'PROVEEDOR_FE_INVALIDO';

  constructor() {
    super('El proveedor no existe o no está vigente en el catálogo PROVEEDOR_FE');
  }
}

export class DatosEmisorInvalidosError extends ValidationError {
  override readonly code = 'DATOS_EMISOR_INVALIDOS';
}

export class VersionObsoletaEmisorError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('El emisor fue modificado por otra operación; vuelva a cargarlo');
  }
}

export class ClaveCertificadoIncorrectaError extends ValidationError {
  override readonly code = 'CLAVE_CERTIFICADO_INCORRECTA';

  constructor() {
    super('La clave no abre el certificado');
  }
}

/** No es un PKCS#12, no trae un certificado con su llave privada o supera el tamaño máximo. */
export class ArchivoCertificadoInvalidoError extends ValidationError {
  override readonly code = 'ARCHIVO_CERTIFICADO_INVALIDO';

  constructor(mensaje = 'El archivo no es un certificado PKCS#12 (.pfx o .p12) con su llave privada') {
    super(mensaje);
  }
}

export class CertificadoSinRucError extends ValidationError {
  override readonly code = 'CERTIFICADO_SIN_RUC';

  constructor() {
    super('El certificado no indica un RUC en su sujeto');
  }
}

/** El certificado se leyó bien pero no sirve para la empresa: HTTP 422. */
export abstract class CertificadoNoAceptadoError extends ValidationError {}

export class CertificadoOtroRucError extends CertificadoNoAceptadoError {
  override readonly code = 'CERTIFICADO_OTRO_RUC';

  constructor() {
    super('El certificado no corresponde al RUC de la empresa');
  }
}

export class CertificadoVencidoError extends CertificadoNoAceptadoError {
  override readonly code = 'CERTIFICADO_VENCIDO';

  constructor() {
    super('El certificado está vencido');
  }
}

export class CertificadoNoVigenteError extends CertificadoNoAceptadoError {
  override readonly code = 'CERTIFICADO_NO_VIGENTE';

  constructor() {
    super('El certificado todavía no está vigente');
  }
}

/** `creado_por` y `modificado_por` exigen el usuario del token. */
export class ActorRequeridoFeError extends ForbiddenError {
  override readonly code = 'ACTOR_REQUERIDO';

  constructor() {
    super('Configurar el emisor exige un usuario en el contexto');
  }
}
