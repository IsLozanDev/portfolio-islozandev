/** Códigos sembrados en `arc.categoria` (db/01m_arc.sql y LOGO en db/01y_org_identidad_empresa.sql). El producto no crea categorías. */
export const CODIGOS_CATEGORIA = ['IMAGEN', 'DOCUMENTO', 'CPE_XML', 'EVIDENCIA', 'ADJUNTO_SOPORTE', 'LOGO'] as const;
export type CodigoCategoria = (typeof CODIGOS_CATEGORIA)[number];

const TAMANO_MINIMO_BYTES = 1;

/** Qué tipos y qué tamaño admite una categoría, y si sus descargas se auditan (`sensible`). */
export class CategoriaArchivo {
  constructor(
    readonly codigo: string,
    readonly mimesPermitidos: readonly string[],
    readonly tamanoMaxBytes: number,
    readonly sensible: boolean,
  ) {}

  admiteMime(mime: string): boolean {
    return this.mimesPermitidos.includes(mime);
  }

  admiteTamano(bytes: number): boolean {
    return Number.isInteger(bytes) && bytes >= TAMANO_MINIMO_BYTES && bytes <= this.tamanoMaxBytes;
  }
}
