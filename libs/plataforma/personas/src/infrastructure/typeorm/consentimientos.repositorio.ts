import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { IsNull, QueryFailedError, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import type { RepositorioConsentimientos } from '../../application/ports/repositorio-consentimientos.js';
import type { Consentimiento, Finalidad } from '../../domain/consentimiento.js';
import { VersionTextoDuplicadaError } from '../../domain/errores.js';
import type { TextoFinalidad } from '../../domain/texto-finalidad.js';
import { ConsentimientoEntidad, TextoFinalidadEntidad, type FilaTextoFinalidad } from './entidades.js';
import { columnasDeRevocacion, consentimientoDesdeFila, filaDesdeConsentimiento, filaDesdeTexto, textoDesdeFila } from './mapeo-consentimientos.js';

const VIOLACION_UNICIDAD = '23505';
const UNICO_VERSION_TEXTO = 'uq_texto_finalidad_version';
const UNICO_ACEPTADO_VIGENTE = 'ux_consentimiento_aceptado_vigente';
const MENSAJE_CARRERA = 'Otra operación cambió los consentimientos de la persona; vuelva a cargarlos';

/**
 * per.texto_finalidad y per.consentimiento sobre el EntityManager de la transacción activa. Filtra por el
 * tenant del contexto además de la RLS (regla 3).
 */
export class RepositorioConsentimientosTypeOrm implements RepositorioConsentimientos {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async decisionesDe(personaId: string): Promise<Consentimiento[]> {
    const filas = await this.manager.getRepository(ConsentimientoEntidad).find({
      where: { personaId, tenantId: this.tenantId },
      order: { registradoEn: 'DESC', id: 'ASC' },
    });
    return filas.map(consentimientoDesdeFila);
  }

  /** Las revocadas primero: el ACEPTA nuevo de la misma finalidad choca con el único de vigentes si no. */
  async guardar(nuevas: Consentimiento[], revocadas: Consentimiento[]): Promise<void> {
    for (const revocada of revocadas) await this.marcarRevocacion(revocada);
    if (nuevas.length === 0) return;
    const tenantId = this.tenantId;
    try {
      await this.manager.getRepository(ConsentimientoEntidad).insert(nuevas.map((nueva) => filaDesdeConsentimiento(nueva, tenantId)));
    } catch (error) {
      throw violoElUnico(error, UNICO_ACEPTADO_VIGENTE) ? new ConflictError(MENSAJE_CARRERA) : error;
    }
  }

  async textosVigentes(): Promise<TextoFinalidad[]> {
    const filas = await this.textosDelTenant()
      .andWhere((consulta) => `texto.publicadoEn = ${this.ultimaPublicacion(consulta)}`)
      .orderBy('texto.finalidad', 'ASC')
      .addOrderBy('texto.id', 'ASC')
      .getMany();
    return unoPorFinalidad(filas).map(textoDesdeFila);
  }

  async historialTextos(finalidad: Finalidad): Promise<TextoFinalidad[]> {
    const filas = await this.manager.getRepository(TextoFinalidadEntidad).find({
      where: { tenantId: this.tenantId, finalidad },
      order: { publicadoEn: 'DESC', id: 'ASC' },
    });
    return filas.map(textoDesdeFila);
  }

  async publicarTexto(texto: TextoFinalidad): Promise<void> {
    try {
      await this.manager.getRepository(TextoFinalidadEntidad).insert(filaDesdeTexto(texto, this.tenantId));
    } catch (error) {
      throw violoElUnico(error, UNICO_VERSION_TEXTO) ? new VersionTextoDuplicadaError() : error;
    }
  }

  /** Solo si sigue sin revocar: el trigger de la base rechaza revocar dos veces y la carrera responde conflict. */
  private async marcarRevocacion(revocada: Consentimiento): Promise<void> {
    const resultado = await this.manager
      .getRepository(ConsentimientoEntidad)
      .update({ id: revocada.id, tenantId: this.tenantId, revocadoEn: IsNull() }, columnasDeRevocacion(revocada));
    if (resultado.affected !== 1) throw new ConflictError(MENSAJE_CARRERA);
  }

  private textosDelTenant(): SelectQueryBuilder<FilaTextoFinalidad> {
    return this.manager
      .getRepository(TextoFinalidadEntidad)
      .createQueryBuilder('texto')
      .where('texto.tenantId = :tenantId', { tenantId: this.tenantId });
  }

  private ultimaPublicacion(consulta: SelectQueryBuilder<FilaTextoFinalidad>): string {
    return consulta
      .subQuery()
      .select('MAX(reciente.publicadoEn)')
      .from(TextoFinalidadEntidad, 'reciente')
      .where('reciente.tenantId = texto.tenantId')
      .andWhere('reciente.finalidad = texto.finalidad')
      .getQuery();
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

/** Dos publicaciones en el mismo instante: queda la primera por id. */
function unoPorFinalidad(filas: FilaTextoFinalidad[]): FilaTextoFinalidad[] {
  return filas.filter((fila, indice) => filas.findIndex((otra) => otra.finalidad === fila.finalidad) === indice);
}

function violoElUnico(error: unknown, restriccion: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = error.driverError as { code?: string; constraint?: string };
  return code === VIOLACION_UNICIDAD && constraint === restriccion;
}
