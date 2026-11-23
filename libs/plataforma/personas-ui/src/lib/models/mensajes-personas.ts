import type { AvisoIdentidad, Coincidencia } from './busqueda';
import { MENSAJE_ERROR_DESCONOCIDO, type ErrorPersonas } from './error-personas';
import { MENSAJES_CONTACTO } from './mensajes-contacto';
import type { TipoDocumento } from './persona';

/** Textos propios del front por código de la API. Los que no están aquí usan el `mensaje` de la API. */
const MENSAJES_POR_CODIGO: Record<string, string> = {
  PERSONA_DUPLICADA: 'Ya existe una persona con ese documento en tu organización.',
  VERSION_OBSOLETA: 'La persona cambió; se recargaron sus datos.',
  conflict: 'La persona cambió; se recargaron sus datos.',
  NO_ENCONTRADA: 'La persona no existe o no es de su organización.',
  PRODUCTO_NO_SUSCRITO: 'Producto no suscrito.',
  CELULAR_PRINCIPAL_OBLIGATORIO: 'La persona debe conservar un celular principal.',
  CONTACTO_DUPLICADO: 'La persona ya tiene ese contacto.',
  UBIGEO_NO_VIGENTE: 'El ubigeo no existe o no está vigente.',
  CONSULTA_MUY_CORTA: 'Escriba al menos 3 letras o 4 dígitos.',
  SIN_PERMISO: 'No tiene permiso para esta acción.',
};

/** Mensaje para el usuario: el propio del código o el que trajo la API (CONTACTO_INVALIDO y similares). */
export function mensajeDeError(error: ErrorPersonas): string {
  return MENSAJES_POR_CODIGO[error.codigo] ?? (error.message || MENSAJE_ERROR_DESCONOCIDO);
}

export const ETIQUETAS_COINCIDENCIA: Record<Coincidencia, string> = { DOCUMENTO: 'Documento', CONTACTO: 'Contacto', NOMBRE: 'Nombre' };

/** RENIEC para DNI y SUNAT para RUC: los que consulta TR-IDN. */
export function fuenteDeIdentidad(tipo: TipoDocumento): string {
  return tipo === 'RUC' ? 'SUNAT' : 'RENIEC';
}

export function textoAvisoIdentidad(aviso: AvisoIdentidad, tipo: TipoDocumento): string {
  const fuente = fuenteDeIdentidad(tipo);
  const avisos: Record<AvisoIdentidad, string> = {
    IDENTIDAD_NO_DISPONIBLE: `No se pudo consultar ${fuente} en este momento. Completa los datos a mano.`,
    CUOTA_AGOTADA: 'Se agotó la cuota de consultas DNI/RUC del mes. Completa los datos a mano.',
    NO_ENCONTRADO_EN_IDENTIDAD: `${fuente} no tiene datos de este documento. Completa los datos a mano.`,
  };
  return avisos[aviso];
}

export const TEXTO_SIN_CONSULTA_EN_LINEA = 'Los carnés de extranjería y los pasaportes no se consultan en línea: completa los datos a mano.';

/** CE y pasaporte: TR-IDN no los consulta. */
export const TIPOS_SIN_CONSULTA_EN_LINEA: readonly TipoDocumento[] = ['CE', 'PASAPORTE'];

export interface AvisoSinPrellenado {
  texto: string;
  advertencia: boolean;
}

/** Por qué no hay prellenado: CE y pasaporte no se consultan; DNI y RUC traen el aviso de TR-IDN. Sin aviso, nada. */
export function avisoSinPrellenado(tipo: TipoDocumento, aviso: AvisoIdentidad | null): AvisoSinPrellenado | null {
  if (TIPOS_SIN_CONSULTA_EN_LINEA.includes(tipo)) return { texto: TEXTO_SIN_CONSULTA_EN_LINEA, advertencia: false };
  if (!aviso) return null;
  return { texto: textoAvisoIdentidad(aviso, tipo), advertencia: aviso !== 'NO_ENCONTRADO_EN_IDENTIDAD' };
}

export const MENSAJES_CELULAR = MENSAJES_CONTACTO.CELULAR;

/** En el alta el correo es opcional: la ayuda lo dice en vez del formato. */
export const MENSAJES_CORREO = { ayuda: 'Opcional', invalido: MENSAJES_CONTACTO.CORREO.invalido } as const;
