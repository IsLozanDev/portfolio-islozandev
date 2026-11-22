import type { VersionArchivo } from '../models/archivo';
import type { FilaVersion } from '../models/fila-version';
import { MENSAJES_ARCHIVO_VERSIONES } from '../models/mensajes-archivo-versiones';
import { ETIQUETAS_ESTADO_ARCHIVO } from '../models/tonos-archivo';
import { formatearFechaHora } from './fecha-lima';
import { formatoBytes } from './formato-bytes';

const SIN_DATO = '—';

export function aFilaVersion(version: VersionArchivo): FilaVersion {
  const disponible = version.estado === 'DISPONIBLE';
  return {
    version,
    numero: version.numero,
    estado: ETIQUETAS_ESTADO_ARCHIVO[version.estado],
    vigente: version.vigente ? MENSAJES_ARCHIVO_VERSIONES.vigente : '',
    tamano: version.bytes === undefined ? SIN_DATO : formatoBytes(version.bytes),
    subida: formatearFechaHora(version.subidoEn),
    descargable: disponible,
    marcable: disponible && !version.vigente,
  };
}

/** La más nueva arriba, como el artboard `ARC-Carga`. */
export function filasDeVersiones(versiones: readonly VersionArchivo[]): FilaVersion[] {
  return [...versiones].sort((una, otra) => otra.numero - una.numero).map(aFilaVersion);
}
