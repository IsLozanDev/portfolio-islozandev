import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { BitacoraConsultas, RegistroConsulta } from '../../application/ports/persistencia.js';
import { ConsultaLogEntidad } from './entidades.js';

/** La RLS de idn.consulta_log solo admite filas del tenant de la transacción. */
export class BitacoraConsultasTypeOrm implements BitacoraConsultas {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async registrar({ tipo, ...registro }: RegistroConsulta): Promise<void> {
    await this.unidadDeTrabajo.manager.getRepository(ConsultaLogEntidad).insert({ ...registro, tipoDoc: tipo });
  }
}
