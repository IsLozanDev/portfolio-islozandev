/** Nombre del archivo en `Content-Disposition: attachment; filename="…"`, o null si no viene. */
export function nombreDeArchivo(contentDisposition: string | null): string | null {
  const coincidencia = contentDisposition ? /filename="?([^";]+)"?/i.exec(contentDisposition) : null;
  return coincidencia?.[1] ?? null;
}

/** Descarga un archivo ya recibido con un enlace temporal; la URL del blob se libera al terminar. */
export function descargarArchivo(documento: Document, archivo: Blob, nombre: string): void {
  const url = URL.createObjectURL(archivo);
  const enlace = documento.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  documento.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
