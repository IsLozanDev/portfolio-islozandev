import { CategoriaArchivo } from '../../src/domain/categoria.js';

const MEGABYTE = 1024 * 1024;
export const DIEZ_MEGABYTES = 10 * MEGABYTE;
export const VEINTICINCO_MEGABYTES = 25 * MEGABYTE;
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Las mismas filas que siembra db/01m_arc.sql. */
export const categoriaImagen = () =>
  new CategoriaArchivo('IMAGEN', ['image/jpeg', 'image/png', 'image/webp'], DIEZ_MEGABYTES, false);
export const categoriaDocumento = () =>
  new CategoriaArchivo('DOCUMENTO', ['application/pdf', MIME_DOCX, 'image/jpeg'], VEINTICINCO_MEGABYTES, true);
