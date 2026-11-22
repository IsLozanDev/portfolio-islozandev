import type { Categoria } from '../models/categoria';
import { formatoBytes } from './formato-bytes';

/** Nombre corto de los MIME de las categorías sembradas (`db/01m_arc.sql`). */
const NOMBRES_POR_MIME: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/xml': 'XML',
  'application/zip': 'ZIP',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'text/plain': 'TXT',
};
const SEPARADOR_SUBTIPO = '/';
const LISTA_ALTERNATIVAS = new Intl.ListFormat('es', { type: 'disjunction' });

function nombreDeTipo(mime: string): string {
  return NOMBRES_POR_MIME[mime] ?? (mime.split(SEPARADOR_SUBTIPO).pop() ?? mime).toUpperCase();
}

/** «PDF, DOCX o JPG». */
export function tiposPermitidos(categoria: Categoria): string {
  return LISTA_ALTERNATIVAS.format(categoria.mimesPermitidos.map(nombreDeTipo));
}

/** «PDF, DOCX o JPG · hasta 25 MB», bajo la zona de carga. */
export function reglaDeCategoria(categoria: Categoria): string {
  return `${tiposPermitidos(categoria)} · hasta ${formatoBytes(categoria.tamanoMaxBytes)}`;
}
