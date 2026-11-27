import type { Emisor, EmisorRespuesta, PruebaEmisor } from '../lib/models/emisor';

export const EMPRESA_ID = '0193f3a0-0000-7000-8000-000000000201';
export const AHORA = new Date('2026-11-25T15:00:00.000Z');

export function respuestaEmisorDePrueba(cambios: Partial<EmisorRespuesta> = {}): EmisorRespuesta {
  return {
    emisor_id: '0193f3a0-0000-7000-8000-000000000301',
    empresa_id: EMPRESA_ID,
    proveedor: 'SUNAT',
    ambiente: 'BETA',
    estado: 'CONFIGURADO',
    regimen_igv: 'GENERAL',
    leyenda_pie: null,
    usuario_proveedor: 'MODDATOS',
    tiene_credencial: true,
    certificado: { ruc: '20601234561', vence_en: '2027-06-30T05:00:00.000Z', huella_sha256: 'ab'.repeat(32) },
    url_proveedor: null,
    prueba: null,
    produccion_habilitada_en: null,
    version: 3,
    ...cambios,
  };
}

export function emisorDePrueba(cambios: Partial<Emisor> = {}): Emisor {
  return {
    emisorId: '0193f3a0-0000-7000-8000-000000000301',
    empresaId: EMPRESA_ID,
    proveedor: 'SUNAT',
    ambiente: 'BETA',
    estado: 'CONFIGURADO',
    regimenIgv: 'GENERAL',
    leyendaPie: null,
    usuarioProveedor: 'MODDATOS',
    tieneCredencial: true,
    certificado: { ruc: '20601234561', venceEn: '2027-06-30T05:00:00.000Z', huellaSha256: 'ab'.repeat(32) },
    urlProveedor: null,
    prueba: null,
    produccionHabilitadaEn: null,
    version: 3,
    ...cambios,
  };
}

export function pruebaDePrueba(cambios: Partial<PruebaEmisor> = {}): PruebaEmisor {
  return {
    estado: 'ACEPTADA',
    numero: 1,
    solicitadaEn: '2026-11-25T14:00:00.000Z',
    resultadoEn: '2026-11-25T14:00:05.000Z',
    codigo: '0',
    descripcion: 'La Boleta numero BP01-1, ha sido aceptada',
    ...cambios,
  };
}

export function haceHoras(horas: number): string {
  return new Date(AHORA.getTime() - horas * 60 * 60 * 1000).toISOString();
}
