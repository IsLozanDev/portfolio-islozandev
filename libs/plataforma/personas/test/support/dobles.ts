import type { CatalogoPort, ResultadoValidacion } from '@vitrina/plataforma/catalogos';
import type { ConsultaDocumento, IdentidadPort, RespuestaConsulta } from '@vitrina/plataforma/identidad';
import type {
  Clock,
  DomainEvent,
  EventPublisher,
  IdGenerator,
  TenantContext,
  TenantScope,
  UnitOfWork,
} from '@vitrina/plataforma/kernel';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import type { DependenciasPersonas } from '../../src/application/dependencias-personas.js';
import type { RepositorioPersonas } from '../../src/application/ports/repositorio-personas.js';
import type { SuscripcionesDelTenant } from '../../src/application/ports/suscripciones-del-tenant.js';
import type { TipoDocumentoPersona } from '../../src/domain/documento-identidad.js';
import type { Persona } from '../../src/domain/persona.js';

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

  private delTenant(): Persona[] {
    return this.guardadas.filter((persona) => persona.tenantId === this.contexto.current().tenantId);
  }
}

export class SuscripcionesFijas implements SuscripcionesDelTenant {
  constructor(public vigentes: ProductoCodigo[]) {}
  async estaVigente(productoCodigo: ProductoCodigo): Promise<boolean> {
    return this.vigentes.includes(productoCodigo);
  }
}

export class CatalogoFijo implements Pick<CatalogoPort, 'validarItem'> {
  readonly consultas: [catalogo: string, codigo: string][] = [];
  constructor(public vigentes: string[] = ['DNI', 'CE', 'RUC', 'PASAPORTE', 'DOC_0']) {}

  async validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion> {
    this.consultas.push([catalogo, codigo]);
    const valido = this.vigentes.includes(codigo);
    return { valido, motivo: valido ? null : 'INEXISTENTE', atributos: valido ? {} : null };
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

export interface Dobles extends DependenciasPersonas {
  unidadDeTrabajo: UnidadDeTrabajoDirecta;
  contexto: ContextoFijo;
  publicador: PublicadorMemoria;
  personas: RepositorioPersonasMemoria;
  suscripciones: SuscripcionesFijas;
  catalogo: CatalogoFijo;
  identidad: IdentidadEspia;
}

export function crearDobles(): Dobles {
  const contexto = new ContextoFijo({ tenantId: TENANT_A });
  return {
    unidadDeTrabajo: new UnidadDeTrabajoDirecta(),
    contexto,
    reloj: new RelojFalso(),
    ids: new IdsEnOrden(),
    publicador: new PublicadorMemoria(),
    personas: new RepositorioPersonasMemoria(contexto),
    suscripciones: new SuscripcionesFijas(['CLI', 'GYM']),
    catalogo: new CatalogoFijo(),
    identidad: new IdentidadEspia(),
  };
}
