import type { DataSource } from 'typeorm';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { RepositorioAvisos, SuscripcionARevisar, SuscripcionesARevisar } from '../../application/ports/vencimientos.js';
import type { AvisoVencimiento } from '../../domain/aviso-vencimiento.js';
import type { FechaCalendario } from '../../domain/fecha-calendario.js';
import { AvisoVencimientoEntidad } from './entidades.js';

export class RepositorioAvisosTypeOrm implements RepositorioAvisos {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  /** ON CONFLICT DO NOTHING sobre ux_aviso: sin fila devuelta, ya se había avisado. */
  async registrar(aviso: AvisoVencimiento): Promise<boolean> {
    const resultado = await this.unidadDeTrabajo.manager
      .createQueryBuilder()
      .insert()
      .into(AvisoVencimientoEntidad)
      .values(aviso)
      .orIgnore()
      .returning('id')
      .execute();
    return (resultado.raw as unknown[]).length > 0;
  }
}

// SQL crudo justificado (regla 11): llamada a la función SECURITY DEFINER org.suscripciones_a_revisar,
// que el ORM no expresa. Va sin transacción de tenant: es la única lectura entre tenants.
const LEER = 'SELECT tenant_id, suscripcion_id FROM org.suscripciones_a_revisar($1::date)';

export class SuscripcionesARevisarTypeOrm implements SuscripcionesARevisar {
  constructor(private readonly dataSource: DataSource) {}

  async listar(fecha: FechaCalendario): Promise<SuscripcionARevisar[]> {
    const filas: { tenant_id: string; suscripcion_id: string }[] = await this.dataSource.query(LEER, [fecha]);
    return filas.map((fila) => ({ tenantId: fila.tenant_id, suscripcionId: fila.suscripcion_id }));
  }
}
