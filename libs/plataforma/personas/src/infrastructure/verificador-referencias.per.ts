import type { ItemReferenciable, VerificadorReferencias } from '@vitrina/plataforma/catalogos';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { CATALOGO_TIPO_DOCUMENTO } from '../domain/documento-identidad.js';
import { PersonaEntidad } from './typeorm/entidades.js';

/**
 * Un tipo de documento usado por personas no se borra del catálogo. Mira solo el tenant del contexto, como
 * la RLS. Hoy `TIPO_DOC_IDENTIDAD` cambia solo por importación, así que ningún borrado llega hasta aquí.
 */
export class VerificadorReferenciasPer implements VerificadorReferencias {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async estaReferenciado({ catalogo, codigo }: ItemReferenciable): Promise<boolean> {
    if (catalogo !== CATALOGO_TIPO_DOCUMENTO) return false;
    const { tenantId } = this.contexto.current();
    return this.unidadDeTrabajo.manager.getRepository(PersonaEntidad).existsBy({ tenantId, tipoDocumento: codigo });
  }
}
