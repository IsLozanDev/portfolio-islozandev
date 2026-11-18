import type { ItemReferenciable, VerificadorReferencias } from '@vitrina/plataforma/catalogos';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { CATALOGO_UBIGEO } from '../domain/direccion.js';
import { CATALOGO_TIPO_DOCUMENTO } from '../domain/documento-identidad.js';
import { DireccionEntidad, PersonaEntidad } from './typeorm/entidades.js';

/**
 * Un tipo de documento usado por personas, o un ubigeo usado por sus direcciones, no se borra del catálogo.
 * Mira solo el tenant del contexto, como la RLS. Hoy `TIPO_DOC_IDENTIDAD` y `UBIGEO` cambian solo por
 * importación, así que ningún borrado llega hasta aquí.
 */
export class VerificadorReferenciasPer implements VerificadorReferencias {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async estaReferenciado({ catalogo, codigo }: ItemReferenciable): Promise<boolean> {
    const { tenantId } = this.contexto.current();
    const { manager } = this.unidadDeTrabajo;
    if (catalogo === CATALOGO_TIPO_DOCUMENTO) return manager.getRepository(PersonaEntidad).existsBy({ tenantId, tipoDocumento: codigo });
    if (catalogo === CATALOGO_UBIGEO) return manager.getRepository(DireccionEntidad).existsBy({ tenantId, ubigeo: codigo });
    return false;
  }
}
