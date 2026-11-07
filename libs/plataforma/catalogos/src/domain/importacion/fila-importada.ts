/** Fila del archivo normalizada y validada contra el diseño de su tabla. */
export interface FilaImportada {
  numero: number;
  codigo: string;
  codigoExterno: string | null;
  nombre: string;
  abreviatura: string | null;
  orden: number;
  /** Solo las claves que define el diseño. */
  atributos: Record<string, string>;
}
