import { inject, Injectable } from '@angular/core';
import { ArchivosCliente, PERMISOS_ARCHIVOS, type UrlDescarga } from '@vitrina/plataforma/archivos-ui';
import { SesionService } from '@vitrina/shared/auth';

/** Antes de que venza, la URL se pide de nuevo: una imagen que carga justo al vencer daría error. */
const MARGEN_VENCIMIENTO_MS = 30_000;

/**
 * URLs firmadas de los logos de empresa (spec 17d). Guarda cada una hasta poco antes de que venza y comparte la
 * petición en curso, para que la lista no pida dos veces el mismo logo. Sin `plat.archivo.descargar` no pide nada:
 * la miniatura muestra la inicial.
 */
@Injectable({ providedIn: 'root' })
export class LogosEmpresaService {
  private readonly archivos = inject(ArchivosCliente);
  private readonly sesion = inject(SesionService);
  private readonly guardadas = new Map<string, UrlDescarga>();
  private readonly enCurso = new Map<string, Promise<string | null>>();

  puedeVer(): boolean {
    return this.sesion.tiene(PERMISOS_ARCHIVOS.descargar);
  }

  /** null sin logo, sin permiso o si ARC no lo entrega (en análisis, rechazado o borrado): nunca lanza. */
  url(archivoId: string | null): Promise<string | null> {
    if (!archivoId || !this.puedeVer()) return Promise.resolve(null);
    const guardada = this.guardadas.get(archivoId);
    if (guardada && sigueVigente(guardada)) return Promise.resolve(guardada.url);

    const pendiente = this.enCurso.get(archivoId) ?? this.pedir(archivoId);
    this.enCurso.set(archivoId, pendiente);
    return pendiente;
  }

  private async pedir(archivoId: string): Promise<string | null> {
    try {
      const descarga = await this.archivos.urlDescarga(archivoId);
      this.guardadas.set(archivoId, descarga);
      return descarga.url;
    } catch {
      return null;
    } finally {
      this.enCurso.delete(archivoId);
    }
  }
}

function sigueVigente(descarga: UrlDescarga): boolean {
  return new Date(descarga.expiraEn).getTime() - Date.now() > MARGEN_VENCIMIENTO_MS;
}
