import type { CertificadoEmisor, Emisor } from '../domain/emisor.js';
import type { AmbienteEmisor, EstadoEmisor } from '../domain/estado-emisor.js';
import type { RegimenIgv } from '../domain/regimen-igv.js';

/** El emisor sin secretos: ni la clave del proveedor ni nada del .pfx, tampoco los ids de la bóveda. */
export interface VistaEmisor {
  emisorId: string;
  empresaId: string;
  proveedor: string;
  ambiente: AmbienteEmisor;
  estado: EstadoEmisor;
  regimenIgv: RegimenIgv;
  leyendaPie: string | null;
  usuarioProveedor: string | null;
  tieneCredencial: boolean;
  certificado: CertificadoEmisor | null;
  version: number;
}

export function vistaDe(emisor: Emisor): VistaEmisor {
  const datos = emisor.datos;
  return {
    emisorId: datos.id,
    empresaId: datos.empresaId,
    proveedor: datos.proveedor,
    ambiente: datos.ambiente,
    estado: datos.estado,
    regimenIgv: datos.regimenIgv,
    leyendaPie: datos.leyendaPie,
    usuarioProveedor: datos.usuarioProveedor,
    tieneCredencial: datos.secretoCredencialId !== null,
    certificado: datos.certificado,
    version: datos.version,
  };
}
