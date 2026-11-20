import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { In, QueryFailedError, type EntityManager, type FindOptionsWhere } from 'typeorm';
import type { RepositorioPersonas } from '../../application/ports/repositorio-personas.js';
import type { Contacto } from '../../domain/contacto.js';
import type { Direccion } from '../../domain/direccion.js';
import type { TipoDocumentoPersona } from '../../domain/documento-identidad.js';
import { ContactoDuplicadoError, PersonaDuplicadaError } from '../../domain/errores.js';
import type { Persona } from '../../domain/persona.js';
import { compararConGuardados, porId } from './diferencias.js';
import { ContactoEntidad, DireccionEntidad, PersonaEntidad, PersonaRolEntidad, type FilaPersona } from './entidades.js';
import {
  columnasEditablesDeContacto,
  columnasEditablesDeDireccion,
  columnasEditablesDePersona,
  filaDesdeContacto,
  filaDesdeDireccion,
  filaDesdePersona,
  filaDesdeRol,
  personaDesdeFilas,
} from './mapeo.js';

const VIOLACION_UNICIDAD = '23505';
const UNICO_CONTACTO_VALOR = 'uq_contacto_valor';

/** Lo que la base tenía de la persona al leerla o guardarla: lo demás es nuevo, cambió o se borró. */
interface EstadoGuardado {
  version: number;
  roles: number;
  contactos: ReadonlyMap<string, Contacto>;
  direcciones: ReadonlyMap<string, Direccion>;
}

/**
 * per.persona con sus roles, contactos y direcciones sobre el EntityManager de la transacción activa.
 * Filtra por el tenant del contexto además de la RLS (regla 3). Una persona que no salió de este
 * repositorio es nueva.
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

  /** Primero la fila de la persona con su versión: si otra operación la cambió, nada más se escribe. */
  async guardar(persona: Persona): Promise<void> {
    const guardado = this.guardadas.get(persona) ?? (await this.insertar(persona));
    if (guardado.version !== persona.version) await this.actualizar(persona, guardado.version);
    await this.insertarRolesNuevos(persona, guardado.roles);
    await this.sincronizarContactos(persona, guardado.contactos);
    await this.sincronizarDirecciones(persona, guardado.direcciones);
    this.recordar(persona);
  }

  private async buscar(filtro: FindOptionsWhere<FilaPersona>): Promise<Persona | null> {
    const tenantId = this.tenantId;
    const fila = await this.manager.getRepository(PersonaEntidad).findOneBy({ ...filtro, tenantId });
    if (!fila) return null;
    const deLaPersona = { personaId: fila.id, tenantId };
    const roles = await this.manager
      .getRepository(PersonaRolEntidad)
      .find({ where: deLaPersona, order: { desde: 'ASC', productoCodigo: 'ASC', rol: 'ASC' } });
    const contactos = await this.manager
      .getRepository(ContactoEntidad)
      .find({ where: deLaPersona, order: { creadoEn: 'ASC', id: 'ASC' } });
    const direcciones = await this.manager
      .getRepository(DireccionEntidad)
      .find({ where: deLaPersona, order: { creadoEn: 'ASC', id: 'ASC' } });
    return this.recordar(personaDesdeFilas({ persona: fila, roles, contactos, direcciones }));
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
    return { version: persona.version, roles: 0, contactos: new Map(), direcciones: new Map() };
  }

  private async idDelDocumento(persona: Persona): Promise<string> {
    const { tipo, numero } = persona.documento;
    const existente = await this.manager.getRepository(PersonaEntidad).findOneOrFail({
      select: { id: true },
      where: { tenantId: this.tenantId, tipoDocumento: tipo, numeroDocumento: numero },
    });
    return existente.id;
  }

  /** Bloqueo optimista: escribe la denominación y la versión nueva solo si la fila sigue en la versión leída. */
  private async actualizar(persona: Persona, versionGuardada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(PersonaEntidad)
      .update({ id: persona.id, tenantId: this.tenantId, version: versionGuardada }, columnasEditablesDePersona(persona));
    if (resultado.affected !== 1) {
      throw new ConflictError('La persona fue modificada por otra operación; vuelva a cargarla');
    }
  }

  private async insertarRolesNuevos(persona: Persona, yaGuardados: number): Promise<void> {
    const nuevos = persona.roles.slice(yaGuardados);
    if (nuevos.length === 0) return;
    await this.manager.getRepository(PersonaRolEntidad).insert(nuevos.map((rolAsignado) => filaDesdeRol(persona, rolAsignado)));
  }

  private async sincronizarContactos(persona: Persona, guardados: ReadonlyMap<string, Contacto>): Promise<void> {
    const { eliminados, cambiados, nuevos } = compararConGuardados(persona.contactos, guardados);
    const contactos = this.manager.getRepository(ContactoEntidad);
    const tenantId = this.tenantId;
    try {
      if (eliminados.length > 0) await contactos.delete({ id: In(eliminados), tenantId });
      for (const contacto of cambiados) await contactos.update({ id: contacto.id, tenantId }, columnasEditablesDeContacto(contacto));
      if (nuevos.length > 0) await contactos.insert(nuevos.map((contacto) => filaDesdeContacto(persona, contacto)));
    } catch (error) {
      throw esContactoRepetido(error) ? new ContactoDuplicadoError() : error;
    }
  }

  private async sincronizarDirecciones(persona: Persona, guardadas: ReadonlyMap<string, Direccion>): Promise<void> {
    const { eliminados, cambiados, nuevos } = compararConGuardados(persona.direcciones, guardadas);
    const direcciones = this.manager.getRepository(DireccionEntidad);
    const tenantId = this.tenantId;
    if (eliminados.length > 0) await direcciones.delete({ id: In(eliminados), tenantId });
    for (const direccion of cambiados) await direcciones.update({ id: direccion.id, tenantId }, columnasEditablesDeDireccion(direccion));
    if (nuevos.length > 0) await direcciones.insert(nuevos.map((direccion) => filaDesdeDireccion(persona, direccion)));
  }

  private recordar(persona: Persona): Persona {
    this.guardadas.set(persona, {
      version: persona.version,
      roles: persona.roles.length,
      contactos: porId(persona.contactos),
      direcciones: porId(persona.direcciones),
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

/** Segunda barrera del contacto repetido: otra operación lo agregó entre la lectura y la escritura. */
function esContactoRepetido(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const { code, constraint } = error.driverError as { code?: string; constraint?: string };
  return code === VIOLACION_UNICIDAD && constraint === UNICO_CONTACTO_VALOR;
}
