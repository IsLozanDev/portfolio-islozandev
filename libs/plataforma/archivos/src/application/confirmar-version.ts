import type { Archivo } from '../domain/archivo.js';
import { ArchivoNoEncontradoError, VersionNoEncontradaError } from '../domain/errores.js';
import { encolarAnalisis, exigirAccesoEntidad, type DependenciasArchivos } from './dependencias-archivos.js';
import type { VersionListada } from './ports/archivo.port.js';
import type { VersionRegistrada } from './ports/repositorio-archivos.js';
import { versionListadaDe } from './vista-archivo.js';

interface VersionConfirmada {
  archivo: Archivo;
  registrada: VersionRegistrada;
}

/**
 * El cliente avisa que ya subió la versión: pasa a `EN_ANALISIS` y se encola su análisis después de confirmar
 * la transacción. Idempotente: una versión que ya está `EN_ANALISIS` se vuelve a encolar con el mismo
 * `jobId`; en cualquier otro estado se devuelve tal cual, sin encolar. Una versión rechazada o limpiada ya no
 * existe.
 */
export class ConfirmarVersion {
  constructor(private readonly dependencias: DependenciasArchivos) {}

  async ejecutar(archivoId: string, numero: number): Promise<VersionListada> {
    const { archivo, registrada } = await this.dependencias.unidadDeTrabajo.run(() => this.confirmar(archivoId, numero));
    if (registrada.estado === 'EN_ANALISIS') {
      await encolarAnalisis(this.dependencias.cola, { tenantId: archivo.tenantId, archivoId: archivo.id, numero });
    }
    return versionListadaDe(registrada, archivo.versionVigente);
  }

  private async confirmar(archivoId: string, numero: number): Promise<VersionConfirmada> {
    const { archivos, autorizadores } = this.dependencias;
    const archivo = await archivos.obtener(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    await exigirAccesoEntidad(autorizadores, archivo, 'puedeEditar');
    if (archivo.confirmarVersion(numero)) await archivos.guardar(archivo);
    const registrada = (await archivos.listarVersiones(archivoId)).find((version) => version.numero === numero);
    if (!registrada) throw new VersionNoEncontradaError();
    return { archivo, registrada };
  }
}
