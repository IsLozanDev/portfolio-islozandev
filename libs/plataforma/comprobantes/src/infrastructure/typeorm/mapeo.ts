import type { AvisoCertificado } from '../../domain/aviso-certificado.js';
import { Emisor, type CertificadoEmisor, type PruebaEmisor } from '../../domain/emisor.js';
import type { AmbienteEmisor, EstadoEmisor, EstadoPrueba } from '../../domain/estado-emisor.js';
import type { RegimenIgv } from '../../domain/regimen-igv.js';
import type { FilaAvisoCertificado, FilaEmisor } from './entidades.js';

function certificadoDesdeFila(fila: FilaEmisor): CertificadoEmisor | null {
  const { certificadoRuc, certificadoVenceEn, certificadoHuellaSha256 } = fila;
  if (certificadoRuc === null || certificadoVenceEn === null || certificadoHuellaSha256 === null) return null;
  return { ruc: certificadoRuc, venceEn: certificadoVenceEn, huellaSha256: certificadoHuellaSha256 };
}

/** Sin estado no hubo prueba (o se limpió al cambiar la configuración); su número es el último correlativo. */
function pruebaDesdeFila(fila: FilaEmisor): PruebaEmisor | null {
  const { pruebaEstado, pruebaSolicitadaEn } = fila;
  if (pruebaEstado === null || pruebaSolicitadaEn === null) return null;
  return {
    estado: pruebaEstado as EstadoPrueba,
    numero: fila.pruebasEnviadas,
    solicitadaEn: pruebaSolicitadaEn,
    resultadoEn: fila.pruebaResultadoEn,
    codigo: fila.pruebaCodigo,
    descripcion: fila.pruebaDescripcion,
  };
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
    urlProveedor: fila.urlProveedor,
    pruebasEnviadas: fila.pruebasEnviadas,
    prueba: pruebaDesdeFila(fila),
    produccionHabilitadaEn: fila.produccionHabilitadaEn,
    produccionHabilitadaPor: fila.produccionHabilitadaPor,
    version: fila.version,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

export function filaDesdeEmisor(emisor: Emisor): FilaEmisor {
  const { certificado, prueba, ...datos } = emisor.datos;
  return {
    ...datos,
    certificadoRuc: certificado?.ruc ?? null,
    certificadoVenceEn: certificado?.venceEn ?? null,
    certificadoHuellaSha256: certificado?.huellaSha256 ?? null,
    pruebaEstado: prueba?.estado ?? null,
    pruebaSolicitadaEn: prueba?.solicitadaEn ?? null,
    pruebaResultadoEn: prueba?.resultadoEn ?? null,
    pruebaCodigo: prueba?.codigo ?? null,
    pruebaDescripcion: prueba?.descripcion ?? null,
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
    urlProveedor: fila.urlProveedor,
    pruebasEnviadas: fila.pruebasEnviadas,
    pruebaEstado: fila.pruebaEstado,
    pruebaSolicitadaEn: fila.pruebaSolicitadaEn,
    pruebaResultadoEn: fila.pruebaResultadoEn,
    pruebaCodigo: fila.pruebaCodigo,
    pruebaDescripcion: fila.pruebaDescripcion,
    produccionHabilitadaEn: fila.produccionHabilitadaEn,
    produccionHabilitadaPor: fila.produccionHabilitadaPor,
    version: fila.version,
    modificadoPor: fila.modificadoPor,
    modificadoEn: fila.modificadoEn,
  };
}

export function filaDesdeAviso(aviso: AvisoCertificado): FilaAvisoCertificado {
  return { ...aviso };
}
