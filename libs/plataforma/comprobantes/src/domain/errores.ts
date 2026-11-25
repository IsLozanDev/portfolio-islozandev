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

/** En producción se rotan la credencial o el certificado, pero no se cambia de proveedor ni de URL. */
export class EmisorEnProduccionError extends ConflictError {
  override readonly code = 'EMISOR_EN_PRODUCCION';

  constructor() {
    super('El emisor está en producción: no se puede cambiar el proveedor ni su URL');
  }
}

export class EstadoEmisorInvalidoError extends ConflictError {
  override readonly code = 'ESTADO_EMISOR_INVALIDO';

  constructor() {
    super('La prueba en beta exige un emisor CONFIGURADO o VERIFICADO');
  }
}

export class PruebaEnCursoError extends ConflictError {
  override readonly code = 'PRUEBA_EN_CURSO';

  constructor() {
    super('Ya hay una prueba en beta en curso; espere su resultado');
  }
}

export class ProduccionNoPermitidaError extends ConflictError {
  override readonly code = 'PRODUCCION_NO_PERMITIDA';

  constructor() {
    super('Este ambiente no permite pasar emisores a producción');
  }
}

export class ProveedorSimuladoEnProduccionError extends ConflictError {
  override readonly code = 'PROVEEDOR_SIMULADO_EN_PRODUCCION';

  constructor() {
    super('El simulador no puede pasar a producción');
  }
}

export class PruebaBetaRequeridaError extends ConflictError {
  override readonly code = 'PRUEBA_BETA_REQUERIDA';

  constructor() {
    super('Pasar a producción exige una prueba en beta aceptada en las últimas 24 horas');
  }
}

/** Sin la URL en el mensaje: puede traer credenciales (TR-RNF-026). */
export class UrlProveedorNoPermitidaError extends ValidationError {
  override readonly code = 'URL_PROVEEDOR_NO_PERMITIDA';

  constructor() {
    super('La URL del proveedor debe ser https, sin credenciales ni otro puerto, y de un dominio permitido para el proveedor');
  }
}

// ---------------------------------------------------------------------
// Emisión de boleta y factura (spec 51). Sin datos del adquirente en los mensajes (TR-RNF-026).
// ---------------------------------------------------------------------

/** Formato o tamaño de un campo de la solicitud: HTTP 400, como la validación del DTO. */
export class DatosComprobanteInvalidosError extends ValidationError {
  override readonly code = 'DATOS_COMPROBANTE_INVALIDOS';
}

/** La solicitud se entendió pero la norma no la admite: HTTP 422. */
export abstract class ComprobanteNoAceptadoError extends ValidationError {}

export class FacturaRequiereRucError extends ComprobanteNoAceptadoError {
  override readonly code = 'FACTURA_REQUIERE_RUC';

  constructor() {
    super('La factura requiere RUC del adquirente');
  }
}

export class BoletaRequiereAdquirenteError extends ComprobanteNoAceptadoError {
  override readonly code = 'BOLETA_REQUIERE_ADQUIRENTE';

  /** `umbral` ya formateado: «S/ 700,00». */
  constructor(umbral: string) {
    super(`Boletas mayores a ${umbral} requieren documento y nombre del adquirente`);
  }
}

export class SerieNoCorrespondeError extends ComprobanteNoAceptadoError {
  override readonly code = 'SERIE_NO_CORRESPONDE';
}

export class SerieAmbiguaError extends ComprobanteNoAceptadoError {
  override readonly code = 'SERIE_AMBIGUA';

  constructor() {
    super('Indique la serie');
  }
}

export class CodigoSunatInvalidoError extends ComprobanteNoAceptadoError {
  override readonly code = 'CODIGO_SUNAT_INVALIDO';

  constructor(
    readonly campo: string,
    codigo: string,
  ) {
    super(`${campo}: el código «${codigo}» no existe, no está vigente o no se admite en el comprobante`);
  }
}

export class CuotasInvalidasError extends ComprobanteNoAceptadoError {
  override readonly code = 'CUOTAS_INVALIDAS';
}

export class TotalNoCoincideError extends ComprobanteNoAceptadoError {
  override readonly code = 'TOTAL_NO_COINCIDE';

  constructor(calculado: string, esperado: string) {
    super(`El total calculado (${calculado}) difiere del esperado (${esperado}) en más de S/ 0,01`);
  }
}

/** El UBL exige el dato y ORG no lo tiene: `campo` dice cuál completar en la empresa o la sucursal. */
export class DatosEmisorIncompletosError extends ComprobanteNoAceptadoError {
  override readonly code = 'DATOS_EMISOR_INCOMPLETOS';

  constructor(readonly campo: string) {
    super(`Falta un dato del emisor que exige el comprobante electrónico: ${campo}`);
  }
}

export class EmisorNoHabilitadoError extends ConflictError {
  override readonly code = 'EMISOR_NO_HABILITADO';

  constructor() {
    super('El emisor debe estar VERIFICADO o en PRODUCCION para emitir comprobantes');
  }
}

/** Configuración de la plataforma, no del llamador: el catálogo TASA_IGV no tiene tasa vigente para el régimen. */
export class TasaIgvNoVigenteError extends ConflictError {
  override readonly code = 'TASA_IGV_NO_VIGENTE';

  constructor(regimen: string) {
    super(`No hay una tasa de IGV vigente para el régimen ${regimen} en el catálogo TASA_IGV`);
  }
}

export class IdempotenciaConflictoError extends ConflictError {
  override readonly code = 'IDEMPOTENCIA_CONFLICTO';

  constructor() {
    super('La clave de idempotencia ya se usó con otro contenido');
  }
}

/** Otra emisión con la misma clave confirmó primero: reintentar con la misma clave devuelve la existente. */
export class EmisionConcurrenteError extends ConflictError {
  override readonly code = 'EMISION_CONCURRENTE';

  constructor() {
    super('Otra emisión con la misma clave de idempotencia terminó primero; reintente para obtenerla');
  }
}

export class ComprobanteNoEncontradoError extends NotFoundError {
  override readonly code = 'COMPROBANTE_NO_ENCONTRADO';

  constructor() {
    super('El comprobante no existe');
  }
}

/** También si es de otro tenant o de otra empresa. */
export class SucursalNoEncontradaError extends NotFoundError {
  override readonly code = 'SUCURSAL_NO_ENCONTRADA';

  constructor() {
    super('La sucursal no existe en la empresa');
  }
}
