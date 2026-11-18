import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager, FindOptionsWhere } from 'typeorm';
import type { RepositorioPersonas } from '../../application/ports/repositorio-personas.js';
import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import { PersonaDuplicadaError } from '../../domain/errores.js';
import type { Persona } from '../../domain/persona.js';
import { ContactoEntidad, PersonaEntidad, PersonaRolEntidad, type FilaPersona } from './entidades.js';
import { filaDesdeContacto, filaDesdePersona, filaDesdeRol, personaDesdeFilas } from './mapeo.js';

/** Lo que la base tenía de la persona al leerla o guardarla: lo demás es nuevo. */
interface EstadoGuardado {
  version: number;
  roles: number;
  contactos: number;
}

/**
 * per.persona con sus roles y contactos sobre el EntityManager de la transacción activa. Filtra por el
 * tenant del contexto además de la RLS (regla 3). Una persona que no salió de este repositorio es nueva.
 */
export class RepositorioPersonasTypeOrm implements RepositorioPersonas {
  private readonly guardadas = new WeakMap<Persona, EstadoGuardado>();

  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  buscarPorDocumento(tipo: TipoDocumentoPersona, numero: string): Promise<Persona | null> {
    return this.buscar({ tipoDocumento: tipo, numeroDocumento: numero });
  }

  obtener(personaId: string): Promise<Persona | null> {
    return this.buscar({ id: personaId });
  }

  async guardar(persona: Persona): Promise<void> {
    const guardado = this.guardadas.get(persona) ?? (await this.insertar(persona));
    if (guardado.version !== persona.version) await this.subirVersion(persona, guardado.version);
    await this.insertarRolesNuevos(persona, guardado.roles);
    await this.insertarContactosNuevos(persona, guardado.contactos);
    this.recordar(persona);
  }

  private async buscar(filtro: FindOptionsWhere<FilaPersona>): Promise<Persona | null> {
    const tenantId = this.tenantId;
    const fila = await this.manager.getRepository(PersonaEntidad).findOneBy({ ...filtro, tenantId });
    if (!fila) return null;
    const roles = await this.manager
      .getRepository(PersonaRolEntidad)
      .find({ where: { personaId: fila.id, tenantId }, order: { desde: 'ASC', productoCodigo: 'ASC', rol: 'ASC' } });
    const contactos = await this.manager
      .getRepository(ContactoEntidad)
      .find({ where: { personaId: fila.id, tenantId }, order: { creadoEn: 'ASC', id: 'ASC' } });
    return this.recordar(personaDesdeFilas(fila, roles, contactos));
  }

  /**
   * El único `uq_persona_documento` decide la carrera de dos registros. Con ON CONFLICT DO NOTHING la
   * transacción sigue viva y se puede leer el id de la persona que ganó.
   */
  private async insertar(persona: Persona): Promise<EstadoGuardado> {
    const resultado = await this.manager
      .createQueryBuilder()
      .insert()
      .into(PersonaEntidad)
      .values(filaDesdePersona(persona))
      .orIgnore()
      .returning('id')
      .execute();
    if ((resultado.raw as unknown[]).length === 0) throw new PersonaDuplicadaError(await this.idDelDocumento(persona));
    return { version: persona.version, roles: 0, contactos: 0 };
  }

  private async idDelDocumento(persona: Persona): Promise<string> {
    const { tipo, numero } = persona.documento;
    const existente = await this.manager.getRepository(PersonaEntidad).findOneOrFail({
      select: { id: true },
      where: { tenantId: this.tenantId, tipoDocumento: tipo, numeroDocumento: numero },
    });
    return existente.id;
  }

  private async subirVersion(persona: Persona, versionGuardada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(PersonaEntidad)
      .update({ id: persona.id, tenantId: this.tenantId, version: versionGuardada }, { version: persona.version });
    if (resultado.affected !== 1) {
      throw new ConflictError('La persona fue modificada por otra operación; vuelva a cargarla');
    }
  }

  private async insertarRolesNuevos(persona: Persona, yaGuardados: number): Promise<void> {
    const nuevos = persona.roles.slice(yaGuardados);
    if (nuevos.length === 0) return;
    await this.manager.getRepository(PersonaRolEntidad).insert(nuevos.map((rolAsignado) => filaDesdeRol(persona, rolAsignado)));
  }

  private async insertarContactosNuevos(persona: Persona, yaGuardados: number): Promise<void> {
    const nuevos = persona.contactos.slice(yaGuardados);
    if (nuevos.length === 0) return;
    await this.manager.getRepository(ContactoEntidad).insert(nuevos.map((contacto) => filaDesdeContacto(persona, contacto)));
  }

  private recordar(persona: Persona): Persona {
    this.guardadas.set(persona, {
      version: persona.version,
      roles: persona.roles.length,
      contactos: persona.contactos.length,
    });
    return persona;
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
