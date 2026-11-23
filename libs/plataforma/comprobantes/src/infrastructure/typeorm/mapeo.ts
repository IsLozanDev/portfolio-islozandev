import type { AvisoCertificado } from '../../domain/aviso-certificado.js';
import { Emisor, type CertificadoEmisor } from '../../domain/emisor.js';
import type { AmbienteEmisor, EstadoEmisor } from '../../domain/estado-emisor.js';
import type { RegimenIgv } from '../../domain/regimen-igv.js';
import type { FilaAvisoCertificado, FilaEmisor } from './entidades.js';

function certificadoDesdeFila(fila: FilaEmisor): CertificadoEmisor | null {
  const { certificadoRuc, certificadoVenceEn, certificadoHuellaSha256 } = fila;
  if (certificadoRuc === null || certificadoVenceEn === null || certificadoHuellaSha256 === null) return null;
  return { ruc: certificadoRuc, venceEn: certificadoVenceEn, huellaSha256: certificadoHuellaSha256 };
}

/** Los CHECK de la tabla garantizan los valores de estado, ambiente y régimen. */
export function emisorDesdeFila(fila: FilaEmisor): Emisor {
  return Emisor.reconstituir({
    id: fila.id,
    tenantId: fila.tenantId,
    empresaId: fila.empresaId,
    proveedor: fila.proveedor,
    ambiente: fila.ambiente as AmbienteEmisor,
    estado: fila.estado as EstadoEmisor,
    regimenIgv: fila.regimenIgv as RegimenIgv,
    leyendaPie: fila.leyendaPie,
    usuarioProveedor: fila.usuarioProveedor,
    secretoCredencialId: fila.secretoCredencialId,
    secretoCertificadoId: fila.secretoCertificadoId,
    secretoClaveCertificadoId: fila.secretoClaveCertificadoId,
    certificado: certificadoDesdeFila(fila),
    version: fila.version,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

export function filaDesdeEmisor(emisor: Emisor): FilaEmisor {
  const { certificado, ...datos } = emisor.datos;
  return {
    ...datos,
    certificadoRuc: certificado?.ruc ?? null,
    certificadoVenceEn: certificado?.venceEn ?? null,
    certificadoHuellaSha256: certificado?.huellaSha256 ?? null,
  };
}

/** Lo que cambia en un UPDATE: todo menos la identidad y la creación. */
export function cambiosDeEmisor(emisor: Emisor): Omit<FilaEmisor, 'id' | 'tenantId' | 'empresaId' | 'creadoPor' | 'creadoEn'> {
  const fila = filaDesdeEmisor(emisor);
  return {
    proveedor: fila.proveedor,
    ambiente: fila.ambiente,
    estado: fila.estado,
    regimenIgv: fila.regimenIgv,
    leyendaPie: fila.leyendaPie,
    usuarioProveedor: fila.usuarioProveedor,
    secretoCredencialId: fila.secretoCredencialId,
    secretoCertificadoId: fila.secretoCertificadoId,
    secretoClaveCertificadoId: fila.secretoClaveCertificadoId,
    certificadoRuc: fila.certificadoRuc,
    certificadoVenceEn: fila.certificadoVenceEn,
    certificadoHuellaSha256: fila.certificadoHuellaSha256,
    version: fila.version,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  };
}

export function filaDesdeAviso(aviso: AvisoCertificado): FilaAvisoCertificado {
  return { ...aviso };
}
