import { ArchivoNoEncontradoError, type ArchivoPort, type EstadoArchivo } from '@vitrina/plataforma/archivos';
import type { AuditoriaPort, EntradaAuditoria } from '@vitrina/plataforma/auditoria';
import type { CatalogoPort, ResultadoValidacion } from '@vitrina/plataforma/catalogos';
import type { ConsultaDocumento, IdentidadPort, RespuestaConsulta } from '@vitrina/plataforma/identidad';
import {
  ConflictError,
  type Clock,
  type DomainEvent,
  type EventPublisher,
  type IdGenerator,
  type TenantContext,
  type TenantScope,
  type UnitOfWork,
} from '@vitrina/plataforma/kernel';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { DependenciasPersonas } from '../../src/application/dependencias-personas.js';
import type {
  ConsultaDuplicados,
  CriteriosDuplicados,
  EvaluacionPar,
  PaginaDuplicados,
} from '../../src/application/ports/consulta-duplicados.js';
import type { ConsultaPersonas, CriteriosConsultaPersonas, PaginaPersonas } from '../../src/application/ports/consulta-personas.js';
import type { RepositorioConsentimientos } from '../../src/application/ports/repositorio-consentimientos.js';
import type { RegistroFusion, RepositorioFusiones } from '../../src/application/ports/repositorio-fusiones.js';
import type { RepositorioPersonas } from '../../src/application/ports/repositorio-personas.js';
import type { SuscripcionesDelTenant } from '../../src/application/ports/suscripciones-del-tenant.js';
import type { Consentimiento, Finalidad } from '../../src/domain/consentimiento.js';
import type { TipoDocumentoPersona } from '../../src/domain/documento-identidad.js';
import type { ParPersonas } from '../../src/domain/duplicados.js';
import type { ResultadoAbsorcion } from '../../src/domain/fusion.js';
import { VersionTextoDuplicadaError } from '../../src/domain/errores.js';
import { Persona } from '../../src/domain/persona.js';
import type { TextoFinalidad } from '../../src/domain/texto-finalidad.js';

export const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
export const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
/** Mediodía en Lima: la fecha de calendario es el 18. */
export const AHORA = new Date('2026-11-18T17:00:00Z');
export const HOY_EN_LIMA = '2026-11-18';

export class RelojFalso implements Clock {
  constructor(public actual = AHORA) {}
  now(): Date {
    return this.actual;
  }
}

export class ContextoFijo implements TenantContext {
  constructor(public alcance: TenantScope) {}
  current(): TenantScope {
    return this.alcance;
  }
  run<Resultado>(alcance: TenantScope, trabajo: () => Promise<Resultado>): Promise<Resultado> {
    const anterior = this.alcance;
    this.alcance = alcance;
    return trabajo().finally(() => {
      this.alcance = anterior;
    });
  }
}

export class UnidadDeTrabajoDirecta implements UnitOfWork {
  transacciones = 0;
  /** Transacciones abiertas en este momento: 0 fuera de `run`. */
  enCurso = 0;
  run<Resultado>(trabajo: () => Promise<Resultado>): Promise<Resultado> {
    this.transacciones += 1;
    this.enCurso += 1;
    return trabajo().finally(() => {
      this.enCurso -= 1;
    });
  }
}

/** Ids con forma de uuid y en orden: `00000000-0000-4000-8000-000000000001`, `...002`. */
export class IdsEnOrden implements IdGenerator {
  private entregados = 0;
  next(): string {
    this.entregados += 1;
    return `00000000-0000-4000-8000-${String(this.entregados).padStart(12, '0')}`;
  }
}

export class PublicadorMemoria implements EventPublisher {
  readonly eventos: DomainEvent[] = [];
  async publish(evento: DomainEvent): Promise<void> {
    this.eventos.push(evento);
  }
  tipos(): string[] {
    return this.eventos.map((evento) => evento.eventType);
  }
}

/** Guarda por tenant del contexto, como el repositorio real. */
export class RepositorioPersonasMemoria implements RepositorioPersonas {
  readonly guardadas: Persona[] = [];
  constructor(private readonly contexto: TenantContext) {}

  async buscarPorDocumento(tipo: TipoDocumentoPersona, numero: string): Promise<Persona | null> {
    return this.delTenant().find(({ documento }) => documento.tipo === tipo && documento.numero === numero) ?? null;
  }

  async obtener(personaId: string): Promise<Persona | null> {
    return this.delTenant().find((persona) => persona.id === personaId) ?? null;
  }

  async guardar(persona: Persona): Promise<void> {
    if (!this.guardadas.includes(persona)) this.guardadas.push(persona);
  }

  readonly fusionesGuardadas: { conservadaId: string; absorbidaId: string; movimientos: ResultadoAbsorcion }[] = [];

  async guardarFusion(conservada: Persona, absorbida: Persona, movimientos: ResultadoAbsorcion): Promise<void> {
    await this.guardar(conservada);
    await this.guardar(absorbida);
    this.fusionesGuardadas.push({ conservadaId: conservada.id, absorbidaId: absorbida.id, movimientos });
  }

  async aliasDe(personaId: string): Promise<string[]> {
    return this.delTenant()
      .filter((persona) => persona.fusion?.conservadaId === personaId)
      .map((persona) => persona.id);
  }

  /** Como un UPDATE de la fila: cambia a quién apunta un alias y sube su versión. */
  reapuntar(alias: Persona, conservadaId: string): void {
    const fusion = alias.fusion;
    if (!fusion) return;
    const reapuntada = Persona.reconstituir(alias.id, alias.version + 1, {
      tenantId: alias.tenantId,
      tipoPersona: alias.tipoPersona,
      documento: alias.documento,
      nombres: alias.nombres,
      apellidoPaterno: alias.apellidoPaterno,
      apellidoMaterno: alias.apellidoMaterno,
      razonSocial: alias.razonSocial,
      activo: alias.activo,
      roles: [...alias.roles],
      contactos: [...alias.contactos],
      direcciones: [...alias.direcciones],
      fusion: { conservadaId, fusionadaEn: fusion.fusionadaEn },
    });
    this.guardadas.splice(this.guardadas.indexOf(alias), 1, reapuntada);
  }

  delTenant(): Persona[] {
    return this.guardadas.filter((persona) => persona.tenantId === this.contexto.current().tenantId);
  }
}

/** Registra las fusiones y los descartes por tenant; re-apunta los alias en el repositorio de personas en memoria. */
export class RepositorioFusionesMemoria implements RepositorioFusiones {
  readonly fusiones: RegistroFusion[] = [];
  private descartes: { tenantId: string; menor: string; mayor: string; usuarioId: string }[] = [];
  constructor(
    private readonly contexto: TenantContext,
    private readonly personas: RepositorioPersonasMemoria,
  ) {}

  async registrar(fusion: RegistroFusion): Promise<void> {
    if (this.fusiones.some((registrada) => registrada.absorbidaId === fusion.absorbidaId)) throw new ConflictError('uq_fusion_absorbida');
    this.fusiones.push(fusion);
  }

  async reapuntarAlias(anteriorConservadaId: string, nuevaConservadaId: string): Promise<number> {
    const alias = this.personas.delTenant().filter((persona) => persona.fusion?.conservadaId === anteriorConservadaId);
    for (const persona of alias) this.personas.reapuntar(persona, nuevaConservadaId);
    return alias.length;
  }

  async descartar(par: ParPersonas, usuarioId: string): Promise<void> {
    if (await this.estaDescartado(par)) return;
    this.descartes.push({ tenantId: this.tenantId, menor: par.menor, mayor: par.mayor, usuarioId });
  }

  async quitarDescarte(par: ParPersonas): Promise<boolean> {
    const antes = this.descartes.length;
    this.descartes = this.descartes.filter((descarte) => !this.esElPar(descarte, par));
    return this.descartes.length < antes;
  }

  async estaDescartado(par: ParPersonas): Promise<boolean> {
    return this.descartes.some((descarte) => this.esElPar(descarte, par));
  }

  private esElPar(descarte: { tenantId: string; menor: string; mayor: string }, par: ParPersonas): boolean {
    return descarte.tenantId === this.tenantId && descarte.menor === par.menor && descarte.mayor === par.mayor;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

/** Devuelve la página y la evaluación fijadas por la prueba, y recuerda lo que recibe. */
export class ConsultaDuplicadosEspia implements ConsultaDuplicados {
  readonly criterios: CriteriosDuplicados[] = [];
  pagina: PaginaDuplicados = { items: [], total: 0 };
  evaluacion: EvaluacionPar | null = null;

  async buscar(criterios: CriteriosDuplicados): Promise<PaginaDuplicados> {
    this.criterios.push(criterios);
    return this.pagina;
  }

  async evaluar(): Promise<EvaluacionPar | null> {
    return this.evaluacion;
  }
}

export class SuscripcionesFijas implements SuscripcionesDelTenant {
  constructor(public vigentes: ProductoCodigo[]) {}
  async estaVigente(productoCodigo: ProductoCodigo): Promise<boolean> {
    return this.vigentes.includes(productoCodigo);
  }
  async listarVigentes(): Promise<ProductoCodigo[]> {
    return [...this.vigentes];
  }
}

/** Guarda los criterios que recibe y devuelve la página fijada por la prueba. */
export class ConsultaPersonasEspia implements ConsultaPersonas {
  readonly criterios: CriteriosConsultaPersonas[] = [];
  pagina: PaginaPersonas = { items: [], total: 0 };

  async buscar(criterios: CriteriosConsultaPersonas): Promise<PaginaPersonas> {
    this.criterios.push(criterios);
    return this.pagina;
  }
}

type ItemDeCatalogo = Pick<ResultadoValidacion, 'nombre' | 'atributos'>;

export const UBIGEO_CAYMA = '040103';
export const UBIGEO_LIMA = '150101';
/** Como el CSV oficial: el distrito es el nombre del ítem, en mayúsculas. */
const UBIGEOS: Record<string, ItemDeCatalogo> = {
  [UBIGEO_CAYMA]: { nombre: 'CAYMA', atributos: { departamento: 'AREQUIPA', provincia: 'AREQUIPA' } },
  [UBIGEO_LIMA]: { nombre: 'LIMA', atributos: { departamento: 'LIMA', provincia: 'LIMA' } },
};

export class CatalogoFijo implements Pick<CatalogoPort, 'validarItem'> {
  readonly consultas: [catalogo: string, codigo: string][] = [];
  ubigeos: Record<string, ItemDeCatalogo> = { ...UBIGEOS };
  /** Ubigeos con vigencia cerrada: existen, pero ya no son válidos ni devuelven nombre. */
  ubigeosCerrados: string[] = [];
  constructor(public vigentes: string[] = ['DNI', 'CE', 'RUC', 'PASAPORTE', 'DOC_0']) {}

  async validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion> {
    this.consultas.push([catalogo, codigo]);
    if (this.ubigeosCerrados.includes(codigo)) return { valido: false, motivo: 'FUERA_DE_VIGENCIA', atributos: {}, nombre: null };
    const ubigeo = this.ubigeos[codigo];
    if (ubigeo) return { valido: true, motivo: null, ...ubigeo };
    const valido = this.vigentes.includes(codigo);
    return { valido, motivo: valido ? null : 'INEXISTENTE', atributos: valido ? {} : null, nombre: valido ? codigo : null };
  }
}

const RESPUESTA_BASE = { fuente: 'PROVEEDOR', proveedor: 'FALSO', consultadoEn: AHORA } as const;

export function respuestaDni(nombres: string, apellidos: string): RespuestaConsulta {
  return { ...RESPUESTA_BASE, tipo: 'DNI', datos: { nombres, apellidos } };
}

export function respuestaRuc(razonSocial: string): RespuestaConsulta {
  const datos = { razonSocial, estado: 'ACTIVO', condicion: 'HABIDO', direccionFiscal: 'Av. Lima 123', ubigeo: '150101' };
  return { ...RESPUESTA_BASE, tipo: 'RUC', datos, aptoFactura: true };
}

/** Responde lo configurado o lanza el error configurado, y recuerda cada consulta. */
export class IdentidadEspia implements Pick<IdentidadPort, 'consultar'> {
  readonly consultas: ConsultaDocumento[] = [];
  constructor(public resultado: RespuestaConsulta | Error = respuestaDni('Juana', 'Quispe Mamani')) {}

  async consultar(consulta: ConsultaDocumento): Promise<RespuestaConsulta> {
    this.consultas.push(consulta);
    if (this.resultado instanceof Error) throw this.resultado;
    return this.resultado;
  }
}

/** Por tenant del contexto, como el repositorio real; un ACEPTA vigente repetido choca como el único de la base. */
export class RepositorioConsentimientosMemoria implements RepositorioConsentimientos {
  private filas: { tenantId: string; consentimiento: Consentimiento }[] = [];
  private textos: { tenantId: string; texto: TextoFinalidad }[] = [];
  constructor(private readonly contexto: TenantContext) {}

  async decisionesDe(personaId: string): Promise<Consentimiento[]> {
    return this.delTenant(this.filas)
      .map(({ consentimiento }) => consentimiento)
      .filter((consentimiento) => consentimiento.personaId === personaId)
      .sort((una, otra) => otra.registradoEn.getTime() - una.registradoEn.getTime());
  }

  async guardar(nuevas: Consentimiento[], revocadas: Consentimiento[]): Promise<void> {
    for (const revocada of revocadas) {
      const fila = this.delTenant(this.filas).find(({ consentimiento }) => consentimiento.id === revocada.id);
      if (!fila || fila.consentimiento.revocacion) throw new ConflictError('carrera');
      fila.consentimiento = revocada;
    }
    const tenantId = this.tenantId;
    for (const nueva of nuevas) {
      const yaAceptada = this.delTenant(this.filas).some(
        ({ consentimiento }) => consentimiento.personaId === nueva.personaId && consentimiento.finalidad === nueva.finalidad && consentimiento.consiente,
      );
      if (nueva.consiente && yaAceptada) throw new ConflictError('carrera');
      this.filas.push({ tenantId, consentimiento: nueva });
    }
  }

  async textosVigentes(): Promise<TextoFinalidad[]> {
    const vigentes = new Map<string, TextoFinalidad>();
    for (const { texto } of this.delTenant(this.textos)) {
      const anterior = vigentes.get(texto.finalidad);
      if (!anterior || anterior.datos.publicadoEn <= texto.datos.publicadoEn) vigentes.set(texto.finalidad, texto);
    }
    return [...vigentes.values()];
  }

  async historialTextos(finalidad: Finalidad): Promise<TextoFinalidad[]> {
    return this.delTenant(this.textos)
      .map(({ texto }) => texto)
      .filter((texto) => texto.finalidad === finalidad)
      .sort((uno, otro) => otro.datos.publicadoEn.getTime() - uno.datos.publicadoEn.getTime());
  }

  async publicarTexto(texto: TextoFinalidad): Promise<void> {
    const repetido = this.delTenant(this.textos).some(({ texto: otro }) => otro.finalidad === texto.finalidad && otro.version === texto.version);
    if (repetido) throw new VersionTextoDuplicadaError();
    this.textos.push({ tenantId: this.tenantId, texto });
  }

  vaciar(): void {
    this.filas = [];
    this.textos = [];
  }

  private delTenant<Fila extends { tenantId: string }>(filas: Fila[]): Fila[] {
    return filas.filter((fila) => fila.tenantId === this.tenantId);
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

export class AuditoriaEspia implements Pick<AuditoriaPort, 'registrar'> {
  readonly entradas: EntradaAuditoria[] = [];
  async registrar(entrada: EntradaAuditoria): Promise<void> {
    this.entradas.push(entrada);
  }
}

type EstadoArchivoFijo = Pick<EstadoArchivo, 'estado' | 'categoria'>;

/** Archivos del tenant A por id; los demás no existen, como un archivo de otro tenant. */
export class ArchivosFijos implements Pick<ArchivoPort, 'estado'> {
  readonly archivos = new Map<string, EstadoArchivoFijo>();

  async estado(archivoId: string): Promise<EstadoArchivo> {
    const archivo = this.archivos.get(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError();
    return { archivoId, nombreOriginal: 'evidencia.pdf', ...archivo };
  }
}

export interface Dobles extends DependenciasPersonas {
  unidadDeTrabajo: UnidadDeTrabajoDirecta;
  reloj: RelojFalso;
  contexto: ContextoFijo;
  publicador: PublicadorMemoria;
  personas: RepositorioPersonasMemoria;
  consultaPersonas: ConsultaPersonasEspia;
  suscripciones: SuscripcionesFijas;
  catalogo: CatalogoFijo;
  identidad: IdentidadEspia;
  consentimientos: RepositorioConsentimientosMemoria;
  auditoria: AuditoriaEspia;
  archivos: ArchivosFijos;
  consultaDuplicados: ConsultaDuplicadosEspia;
  fusiones: RepositorioFusionesMemoria;
}

export const USUARIO_DEL_CONTEXTO = 'cccccccc-0000-4000-8000-000000000003';

export function crearDobles(): Dobles {
  const contexto = new ContextoFijo({ tenantId: TENANT_A, actorId: USUARIO_DEL_CONTEXTO });
  const personas = new RepositorioPersonasMemoria(contexto);
  return {
    unidadDeTrabajo: new UnidadDeTrabajoDirecta(),
    contexto,
    reloj: new RelojFalso(),
    ids: new IdsEnOrden(),
    publicador: new PublicadorMemoria(),
    personas,
    consultaPersonas: new ConsultaPersonasEspia(),
    suscripciones: new SuscripcionesFijas(['CLI', 'GYM']),
    catalogo: new CatalogoFijo(),
    identidad: new IdentidadEspia(),
    consentimientos: new RepositorioConsentimientosMemoria(contexto),
    auditoria: new AuditoriaEspia(),
    archivos: new ArchivosFijos(),
    consultaDuplicados: new ConsultaDuplicadosEspia(),
    fusiones: new RepositorioFusionesMemoria(contexto, personas),
  };
}
