import { ArchivoNoDisponibleError, ArchivoNoEncontradoError, VersionNoDisponibleError, type ArchivoPort } from '@vitrina/plataforma/archivos';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { LogoFirmado, UrlLogoEmpresa } from './consulta-tenants.js';

const VIGENCIA_LOGO_SEGUNDOS = 300;

/**
 * Spec 17d: ARC solo firma archivos del tenant del contexto, y el operador está en el de plataforma. Se firma dentro
 * del contexto del tenant consultado, como los trabajos del worker. LOGO no es sensible: no deja auditoría de descarga.
 */
export class UrlLogoEmpresaArchivos implements UrlLogoEmpresa {
  constructor(
    private readonly contexto: TenantContext,
    private readonly archivos: ArchivoPort,
  ) {}

  async firmar(tenantId: string, archivoId: string): Promise<LogoFirmado | null> {
    try {
      return await this.contexto.run({ tenantId }, () =>
        this.archivos.urlDescarga({ archivoId, disposicion: 'inline', vigenciaSegundos: VIGENCIA_LOGO_SEGUNDOS }),
      );
    } catch (error) {
      if (esLogoNoDisponible(error)) return null;
      throw error;
    }
  }
}

/** Un logo borrado, en análisis o rechazado no rompe el detalle del tenant: se muestra la inicial. */
function esLogoNoDisponible(error: unknown): boolean {
  return error instanceof ArchivoNoEncontradoError || error instanceof ArchivoNoDisponibleError || error instanceof VersionNoDisponibleError;
}
