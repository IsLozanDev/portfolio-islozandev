export const MENSAJES_ARCHIVO_VERSIONES = {
  titulo: 'Versiones',
  subirVersion: 'Subir versión',
  enCurso: 'Hay una versión en análisis. Podrás subir otra cuando termine.',
  sinVersiones: 'Este archivo todavía no tiene versiones.',
  columnaVersion: 'Versión',
  columnaEstado: 'Estado',
  columnaVigente: 'Vigente',
  columnaTamano: 'Tamaño',
  columnaSubida: 'Subida',
  vigente: 'Vigente',
  descargar: 'Descargar',
  marcarVigente: 'Marcar vigente',
  descargarVersion: (numero: number) => `Descargar la versión ${numero}`,
  marcarVigenteVersion: (numero: number) => `Marcar vigente la versión ${numero}`,
  tituloConfirmacion: (numero: number) => `¿Marcar vigente la versión ${numero}?`,
  textoConfirmacion: (numero: number, vigente: number | undefined) =>
    vigente === undefined
      ? `La descarga por defecto entregará la versión ${numero}.`
      : `La descarga por defecto entregará la versión ${numero}. La versión ${vigente} sigue disponible.`,
  vigenteCambiada: (numero: number) => `La versión ${numero} quedó vigente.`,
  subtituloPanel: (nombre: string, vigente: number | undefined) => (vigente === undefined ? nombre : `${nombre} · vigente: versión ${vigente}`),
  notaPanel: 'Si pasa el análisis queda como vigente. Las versiones anteriores se conservan y se pueden descargar.',
  cerrar: 'Cerrar',
  errorCarga: 'No se pudieron leer las versiones. Inténtalo otra vez.',
} as const;
