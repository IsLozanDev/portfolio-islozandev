/** La URL firmada viene con `attachment`: el navegador la descarga con el nombre original sin dejar la página. */
export function abrirDescarga(url: string): void {
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.rel = 'noopener';
  enlace.click();
}
