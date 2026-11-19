import type { EventPublisher } from '@vitrina/plataforma/kernel';
import { ArchivoNoEncontradoError } from '../domain/errores.js';
import { exigirAccesoEntidad, publicarEventosDe, type DependenciasArchivos } from './dependencias-archivos.js';
import type { EstadoArchivo } from './ports/archivo.port.js';
import { estadoDe } from './vista-archivo.js';

export interface DependenciasVersionVigente extends Pick<DependenciasArchivos, 'unidadDeTrabajo' | 'archivos' | 'autorizadores'> {
  publicador: EventPublisher;
}

/**
 * Elige una versión `DISPONIBLE` anterior como vigente: la descarga por defecto pasa a entregarla. Si cambió,
 * guarda y publica en la misma transacción. Idempotente: marcar la que ya es vigente no guarda ni publica.
 */
export class MarcarVersionVigente {
  constructor(private readonly dependencias: DependenciasVersionVigente) {}

  ejecutar(archivoId: string, numero: number): Promise<EstadoArchivo> {
    const { unidadDeTrabajo, archivos, autorizadores, publicador } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const archivo = await archivos.obtener(archivoId);
      if (!archivo) throw new ArchivoNoEncontradoError();
      await exigirAccesoEntidad(autorizadores, archivo, 'puedeEditar');
      if (archivo.marcarVigente(numero)) {
        await archivos.guardar(archivo);
        await publicarEventosDe(publicador, archivo);
      }
      return estadoDe(archivo);
    });
  }
}
