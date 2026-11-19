import { ArchivoNoEncontradoError } from '../domain/errores.js';
import { exigirAccesoEntidad, type DependenciasArchivos } from './dependencias-archivos.js';
import type { VersionesArchivo } from './ports/archivo.port.js';
import { versionListadaDe } from './vista-archivo.js';

/** Las versiones de un archivo del tenant, por número y con cuál es la vigente. Las rechazadas ya no existen. */
export class ListarVersiones {
  constructor(private readonly dependencias: Pick<DependenciasArchivos, 'unidadDeTrabajo' | 'archivos' | 'autorizadores'>) {}

  ejecutar(archivoId: string): Promise<VersionesArchivo> {
    const { unidadDeTrabajo, archivos, autorizadores } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const archivo = await archivos.obtener(archivoId);
      if (!archivo) throw new ArchivoNoEncontradoError();
      await exigirAccesoEntidad(autorizadores, archivo, 'puedeLeer');
      const versiones = await archivos.listarVersiones(archivoId);
      return {
        archivoId,
        ...(archivo.versionVigente !== null && { versionVigente: archivo.versionVigente }),
        versiones: versiones.map((version) => versionListadaDe(version, archivo.versionVigente)),
      };
    });
  }
}
