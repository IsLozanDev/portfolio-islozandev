import type { VersionArchivo } from './archivo';

/** Una fila de `vit-archivo-versiones`: los textos de la tabla y lo que se puede hacer con ella. */
export interface FilaVersion {
  version: VersionArchivo;
  numero: number;
  estado: string;
  vigente: string;
  tamano: string;
  subida: string;
  descargable: boolean;
  marcable: boolean;
}
