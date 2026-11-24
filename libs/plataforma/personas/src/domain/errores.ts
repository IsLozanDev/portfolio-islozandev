import { ConflictError, NotFoundError, ValidationError } from '@vitrina/plataforma/kernel';
import type { MotivoInvalidez } from '@vitrina/shared/util';

/** El mensaje lleva solo el motivo: el número de documento no va a logs (TR-RNF-026 y 111). */
export class DocumentoInvalidoPersonaError extends ValidationError {
  override readonly code = 'DOCUMENTO_INVALIDO';

  constructor(readonly motivo: MotivoInvalidez) {
    super(`Documento inválido: ${motivo}`);
  }
}

/** El catálogo `TIPO_DOC_IDENTIDAD` trae más tipos de los que personas admite. */
export class TipoDocumentoNoAdmitidoError extends ValidationError {
  override readonly code = 'TIPO_DOCUMENTO_NO_ADMITIDO';

  constructor() {
    super('Ese tipo de documento no se admite para registrar personas');
  }
}

export class TipoPersonaIncoherenteError extends ValidationError {
  override readonly code = 'TIPO_PERSONA_INCOHERENTE';

  constructor() {
    super('El tipo de persona no corresponde con el documento o con los datos enviados');
  }
}

export class ContactoInvalidoError extends ValidationError {
  override readonly code = 'CONTACTO_INVALIDO';
}

export class PersonaDuplicadaError extends ConflictError {
  override readonly code = 'PERSONA_DUPLICADA';

  constructor(readonly personaId: string) {
    super('Ya existe una persona con ese documento');
  }
}

export class PersonaNoEncontradaError extends NotFoundError {
  override readonly code = 'NO_ENCONTRADA';

  constructor() {
    super('No existe esa persona');
  }
}

export class ProductoNoSuscritoError extends ValidationError {
  override readonly code = 'PRODUCTO_NO_SUSCRITO';

  constructor() {
    super('Producto no suscrito');
  }
}

/** Sin el texto buscado en el mensaje: puede ser un nombre o un documento (TR-RNF-026). */
export class ConsultaMuyCortaError extends ValidationError {
  override readonly code = 'CONSULTA_MUY_CORTA';

  constructor() {
    super('Escriba al menos 3 letras o 4 dígitos');
  }
}

// Los mensajes de contactos y direcciones no llevan el valor ni la dirección (TR-RNF-026).

export class ContactoDuplicadoError extends ConflictError {
  override readonly code = 'CONTACTO_DUPLICADO';

  constructor() {
    super('La persona ya tiene ese contacto');
  }
}

export class CelularPrincipalObligatorioError extends ValidationError {
  override readonly code = 'CELULAR_PRINCIPAL_OBLIGATORIO';

  constructor() {
    super('La persona debe conservar un celular principal');
  }
}

export class DireccionInvalidaError extends ValidationError {
  override readonly code = 'DIRECCION_INVALIDA';
}

export class UbigeoNoVigenteError extends ValidationError {
  override readonly code = 'UBIGEO_NO_VIGENTE';

  constructor() {
    super('El ubigeo no existe o no está vigente');
  }
}

export class ContactoNoEncontradoError extends NotFoundError {
  override readonly code = 'CONTACTO_NO_ENCONTRADO';

  constructor() {
    super('La persona no tiene ese contacto');
  }
}

export class DireccionNoEncontradaError extends NotFoundError {
  override readonly code = 'DIRECCION_NO_ENCONTRADA';

  constructor() {
    super('La persona no tiene esa dirección');
  }
}

/** La versión que leyó el cliente ya no es la de la persona. La carrera dentro de la transacción sigue como `conflict`. */
export class VersionObsoletaPersonaError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('La persona cambió desde que se leyó; vuelva a cargarla');
  }
}

// Consentimientos (spec 37). Los mensajes no llevan el texto legal ni datos de la persona.

export class AccionExpresaRequeridaError extends ValidationError {
  override readonly code = 'ACCION_EXPRESA_REQUERIDA';

  constructor() {
    super('Cada decisión exige una acción expresa del titular');
  }
}

/** Decisión, finalidad o canal fuera de lista, o un lote vacío. */
export class DatosConsentimientoInvalidosError extends ValidationError {
  override readonly code = 'DATOS_INVALIDOS';
}

export class FinalidadRepetidaError extends ValidationError {
  override readonly code = 'FINALIDAD_REPETIDA';

  constructor(readonly finalidad: string) {
    super(`La finalidad ${finalidad} se repite en el lote`);
  }
}

export class TextoNoPublicadoError extends ConflictError {
  override readonly code = 'TEXTO_NO_PUBLICADO';

  constructor(readonly finalidad: string) {
    super(`La finalidad ${finalidad} no tiene texto publicado`);
  }
}

export class VersionTextoNoVigenteError extends ConflictError {
  override readonly code = 'VERSION_TEXTO_NO_VIGENTE';

  constructor(
    readonly finalidad: string,
    readonly versionVigente: string,
  ) {
    super(`La versión del texto de ${finalidad} no es la vigente`);
  }
}

export class VersionTextoDuplicadaError extends ConflictError {
  override readonly code = 'VERSION_TEXTO_DUPLICADA';

  constructor() {
    super('Esa versión del texto ya está publicada para la finalidad');
  }
}

export class SinConsentimientoVigenteError extends ConflictError {
  override readonly code = 'SIN_CONSENTIMIENTO_VIGENTE';

  constructor() {
    super('La persona no tiene un consentimiento vigente en esa finalidad');
  }
}

export const MOTIVOS_EVIDENCIA_INVALIDA = ['NO_DISPONIBLE', 'CATEGORIA'] as const;
export type MotivoEvidenciaInvalida = (typeof MOTIVOS_EVIDENCIA_INVALIDA)[number];

const MENSAJES_EVIDENCIA_INVALIDA: Record<MotivoEvidenciaInvalida, string> = {
  NO_DISPONIBLE: 'La evidencia todavía no está disponible',
  CATEGORIA: 'La evidencia no es de la categoría EVIDENCIA',
};

export class EvidenciaInvalidaError extends ValidationError {
  override readonly code = 'EVIDENCIA_INVALIDA';

  constructor(readonly motivo: MotivoEvidenciaInvalida) {
    super(MENSAJES_EVIDENCIA_INVALIDA[motivo]);
  }
}

/** Un archivo de otro tenant o inexistente. */
export class EvidenciaNoEncontradaError extends NotFoundError {
  override readonly code = 'EVIDENCIA_NO_ENCONTRADA';

  constructor() {
    super('No existe ese archivo de evidencia');
  }
}

export class TextoFinalidadInvalidoError extends ValidationError {
  override readonly code = 'DATOS_INVALIDOS';
}

// Duplicados y fusión (spec 39). Los mensajes no llevan nombres, documentos ni contactos.

export class MismaPersonaError extends ValidationError {
  override readonly code = 'MISMA_PERSONA';

  constructor() {
    super('No se puede fusionar una persona consigo misma');
  }
}

/** TR-CA-108: mismo tipo de documento con distinto número. */
export class DocumentosDistintosError extends ConflictError {
  override readonly code = 'DOCUMENTOS_DISTINTOS';

  constructor() {
    super('Las personas tienen documentos distintos');
  }
}

export class TipoPersonaDistintoError extends ConflictError {
  override readonly code = 'TIPO_PERSONA_DISTINTO';

  constructor() {
    super('No se puede fusionar una persona natural con una jurídica');
  }
}

/** La persona es alias de otra: lleva la conservada para que el cliente la cargue. */
export class PersonaYaFusionadaError extends ConflictError {
  override readonly code = 'PERSONA_FUSIONADA';

  constructor(readonly conservadaId: string) {
    super('La persona se fusionó con otra ficha');
  }
}

export class MotivoFusionInvalidoError extends ValidationError {
  override readonly code = 'MOTIVO_INVALIDO';

  constructor(minimo: number, maximo: number) {
    super(`El motivo debe tener entre ${minimo} y ${maximo} caracteres`);
  }
}

export class CampoElegidoInvalidoError extends ValidationError {
  override readonly code = 'CAMPO_ELEGIDO_INVALIDO';
}

export class DescarteNoEncontradoError extends NotFoundError {
  override readonly code = 'DESCARTE_NO_ENCONTRADO';

  constructor() {
    super('El par no estaba descartado');
  }
}
