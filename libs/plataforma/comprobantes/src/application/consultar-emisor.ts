import { EmisorNoEncontradoError } from '../domain/errores.js';
import type { DependenciasEmisor } from './dependencias-fe.js';
import { vistaDe, type VistaEmisor } from './vista-emisor.js';

/** Un emisor de otro tenant no se ve con la RLS: responde que no existe (404). */
export class ConsultarEmisor {
  constructor(private readonly dependencias: Pick<DependenciasEmisor, 'unidadDeTrabajo' | 'emisores'>) {}

  ejecutar(empresaId: string): Promise<VistaEmisor> {
    const { unidadDeTrabajo, emisores } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const emisor = await emisores.porEmpresa(empresaId);
      if (!emisor) throw new EmisorNoEncontradoError();
      return vistaDe(emisor);
    });
  }
}
