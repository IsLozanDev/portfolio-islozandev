import { HttpErrorResponse } from '@angular/common/http';
import { CODIGO_VERSION_OBSOLETA, ErrorAdmin } from './error-admin';

export const CODIGO_VARIABLE_NO_PERMITIDA = 'VARIABLE_NO_PERMITIDA';
export const CODIGO_CONTENIDO_PLANTILLA_INVALIDO = 'CONTENIDO_PLANTILLA_INVALIDO';

export type CampoPlantilla = 'asunto' | 'cuerpo';

/** Los motivos del back sobre el asunto empiezan así («El asunto es obligatorio», «El asunto pasa de…»). */
const MOTIVO_DEL_ASUNTO = /^El asunto/i;

/** TR-CA-185: marcadores que la base no declara. */
export class VariableNoPermitidaError extends ErrorAdmin {
  constructor(
    readonly variables: readonly string[],
    origen: ErrorAdmin,
  ) {
    super(origen.codigo, origen.message, origen.estado, { cause: origen });
    this.name = 'VariableNoPermitidaError';
  }
}

/** Asunto vacío, largo o con salto de línea; cuerpo vacío o largo. */
export class ContenidoPlantillaInvalidoError extends ErrorAdmin {
  readonly campo: CampoPlantilla;

  constructor(origen: ErrorAdmin) {
    super(origen.codigo, origen.message, origen.estado, { cause: origen });
    this.name = 'ContenidoPlantillaInvalidoError';
    this.campo = MOTIVO_DEL_ASUNTO.test(origen.message) ? 'asunto' : 'cuerpo';
  }
}

/** Otra persona guardó una versión nueva desde que se abrió el editor. */
export class VersionObsoletaPlantillaError extends ErrorAdmin {
  constructor(origen: ErrorAdmin) {
    super(origen.codigo, origen.message, origen.estado, { cause: origen });
    this.name = 'VersionObsoletaPlantillaError';
  }
}

/** Traduce los errores de la API de plantillas a los propios; los demás pasan igual. */
export function aErrorPlantilla(error: ErrorAdmin): ErrorAdmin {
  if (error.codigo === CODIGO_VARIABLE_NO_PERMITIDA) return new VariableNoPermitidaError(variablesDe(error), error);
  if (error.codigo === CODIGO_CONTENIDO_PLANTILLA_INVALIDO) return new ContenidoPlantillaInvalidoError(error);
  if (error.codigo === CODIGO_VERSION_OBSOLETA) return new VersionObsoletaPlantillaError(error);
  return error;
}

function variablesDe(error: ErrorAdmin): string[] {
  const respuesta = error.cause instanceof HttpErrorResponse ? error.cause : null;
  const variables: unknown = (respuesta?.error as { variables?: unknown } | null)?.variables;
  return Array.isArray(variables) ? variables.filter((nombre): nombre is string => typeof nombre === 'string') : [];
}
