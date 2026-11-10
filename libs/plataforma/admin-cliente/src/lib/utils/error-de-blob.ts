import { HttpErrorResponse } from '@angular/common/http';

/** Con `responseType: 'blob'` el cuerpo del error también llega como Blob: se lee para tener `{ codigo, mensaje }`. */
export async function conCuerpoJson(error: unknown): Promise<unknown> {
  if (!(error instanceof HttpErrorResponse) || !(error.error instanceof Blob)) return error;
  try {
    const cuerpo: unknown = JSON.parse(await leerTexto(error.error));
    return new HttpErrorResponse({ error: cuerpo, headers: error.headers, status: error.status, url: error.url ?? undefined });
  } catch {
    return error;
  }
}

/** FileReader y no `Blob.text()`: funciona igual en el navegador y en jsdom. */
function leerTexto(archivo: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsText(archivo);
  });
}
