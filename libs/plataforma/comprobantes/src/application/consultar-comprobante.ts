import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import { ComprobanteNoEncontradoError } from '../domain/errores.js';
import type { RepositorioComprobantes } from './ports/repositorio-comprobantes.js';
import { vistaComprobanteDe, type VistaComprobante } from './vista-comprobante.js';

export interface DependenciasConsulta {
  unidadDeTrabajo: UnitOfWork;
  comprobantes: RepositorioComprobantes;
}

/** El comprobante del tenant del contexto; ComprobanteNoEncontradoError también si es de otro tenant (RLS). */
export class ConsultarComprobante {
  constructor(private readonly dependencias: DependenciasConsulta) {}

  ejecutar(comprobanteId: string): Promise<VistaComprobante> {
    const { unidadDeTrabajo, comprobantes } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const comprobante = await comprobantes.porId(comprobanteId);
      if (!comprobante) throw new ComprobanteNoEncontradoError();
      return vistaComprobanteDe(comprobante);
    });
  }
}
