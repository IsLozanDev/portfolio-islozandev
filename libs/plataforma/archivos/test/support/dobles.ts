import type { DomainEvent, EventPublisher, IdGenerator, TenantContext, TenantScope, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { AuditoriaPort, EntradaAuditoria } from '@vitrina/plataforma/auditoria';
import type { DependenciasAnalisis, DependenciasArchivos } from '../../src/application/dependencias-archivos.js';
import type { DependenciasDescarga } from '../../src/application/emitir-url-descarga.js';
import type { AnalizadorAntivirus, ResultadoAntivirus } from '../../src/application/ports/analizador-antivirus.js';
import type { ResultadoAnalisis } from '../../src/application/ports/canal-analisis.js';
import type { CargaFirmada } from '../../src/application/ports/almacen-archivos.js';
import type { AutorizadorEntidad } from '../../src/application/ports/autorizador-entidad.js';
import type { ColaAnalisis, TrabajoAnalisis } from '../../src/application/ports/cola-analisis.js';
import type { RepositorioArchivos, VersionRegistrada } from '../../src/application/ports/repositorio-archivos.js';
import type { Archivo } from '../../src/domain/archivo.js';
import { CategoriaArchivo } from '../../src/domain/categoria.js';
import { AlmacenNoDisponibleError } from '../../src/domain/errores.js';
import { AnalizadorFirmaEicar } from '../../src/infrastructure/antivirus/analizador-firma-eicar.js';
import { CanalAnalisisMemoria } from '../../src/infrastructure/memoria/canal-analisis.memoria.js';
import { idDeTrabajo } from '../../src/infrastructure/bullmq/cola-analisis.bullmq.js';
import { AlmacenArchivosMemoria } from '../../src/infrastructure/memoria/almacen-archivos.memoria.js';
import { DetectorTipoFileType } from '../../src/infrastructure/tipo/detector-tipo.file-type.js';
import { categoriaCpeXml, categoriaDocumento, categoriaImagen, VEINTICINCO_MEGABYTES } from './categorias.js';
import { RelojFijo } from './reloj-fijo.js';

export const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
export const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
export const USUARIO = 'cccccccc-0000-4000-8000-000000000003';
export const AHORA = '2026-11-18T15:00:00.000Z';
export const ENTIDAD_CON_AUTORIZADOR = 'PRUEBA_SENSIBLE';

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

/** Recuerda cada evento y si se publicó dentro de una transacción (regla 4). */
export class PublicadorMemoria implements EventPublisher {
  readonly eventos: DomainEvent[] = [];
  readonly publicadosEnTransaccion: boolean[] = [];
  constructor(private readonly unidadDeTrabajo: UnidadDeTrabajoDirecta) {}

  publish(evento: DomainEvent): Promise<void> {
    this.eventos.push(evento);
    this.publicadosEnTransaccion.push(this.unidadDeTrabajo.enCurso > 0);
    return Promise.resolve();
  }

  tipos(): string[] {
    return this.eventos.map((evento) => evento.eventType);
  }
}

/** Recuerda si cada resultado se publicó dentro de una transacción: debe ser después de confirmarla. */
export class CanalAnalisisEspia extends CanalAnalisisMemoria {
  readonly publicadosEnTransaccion: boolean[] = [];
  readonly fallas: unknown[] = [];
  constructor(private readonly unidadDeTrabajo: UnidadDeTrabajoDirecta) {
    super();
  }

  override publicar(resultado: ResultadoAnalisis): Promise<void> {
    this.publicadosEnTransaccion.push(this.unidadDeTrabajo.enCurso > 0);
    return super.publicar(resultado);
  }
}

/** Guarda por tenant del contexto, como el repositorio real, y cuenta las escrituras. */
export class RepositorioArchivosMemoria implements RepositorioArchivos {
  readonly guardados: Archivo[] = [];
  escrituras = 0;
  readonly categorias = [
    categoriaImagen(),
    categoriaDocumento(),
    new CategoriaArchivo('ADJUNTO_SOPORTE', ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'], VEINTICINCO_MEGABYTES, false),
    categoriaCpeXml(),
  ];

  constructor(private readonly contexto: TenantContext) {}

  obtener(archivoId: string): Promise<Archivo | null> {
    const tenantId = this.contexto.current().tenantId;
    return Promise.resolve(this.guardados.find((archivo) => archivo.id === archivoId && archivo.tenantId === tenantId) ?? null);
  }

  guardar(archivo: Archivo): Promise<void> {
    this.escrituras += 1;
    if (!this.guardados.includes(archivo)) this.guardados.push(archivo);
    return Promise.resolve();
  }

  eliminar(archivoId: string): Promise<void> {
    const posicion = this.guardados.findIndex((archivo) => archivo.id === archivoId);
    if (posicion >= 0) this.guardados.splice(posicion, 1);
    return Promise.resolve();
  }

  buscarCategoria(codigo: string): Promise<CategoriaArchivo | null> {
    return Promise.resolve(this.categorias.find((categoria) => categoria.codigo === codigo) ?? null);
  }

  listarCategorias(): Promise<CategoriaArchivo[]> {
    return Promise.resolve([...this.categorias].sort((una, otra) => una.codigo.localeCompare(otra.codigo)));
  }

  /** Todas subidas en `AHORA`: el agregado no lleva la fecha. */
  async listarVersiones(archivoId: string): Promise<VersionRegistrada[]> {
    const archivo = await this.obtener(archivoId);
    return (archivo?.versiones ?? []).map((version) => ({ ...version, subidoEn: new Date(AHORA) }));
  }
}

/** Como BullMQ con `jobId` (`{archivoId}-{numero}`): una versión con trabajo vivo no se encola dos veces. */
export class ColaMemoria implements ColaAnalisis {
  readonly vivos = new Map<string, TrabajoAnalisis>();
  intentos = 0;
  caida = false;

  encolar(trabajo: TrabajoAnalisis): Promise<void> {
    this.intentos += 1;
    if (this.caida) return Promise.reject(new Error('Redis no responde'));
    const id = idDeTrabajo(trabajo);
    if (!this.vivos.has(id)) this.vivos.set(id, trabajo);
    return Promise.resolve();
  }

  /** El worker toma los trabajos: dejan de estar vivos. */
  tomarTodos(): TrabajoAnalisis[] {
    const trabajos = [...this.vivos.values()];
    this.vivos.clear();
    return trabajos;
  }
}

/** Almacén en memoria que además puede caerse y recuerda si firmó dentro de una transacción. */
export class AlmacenConFallas extends AlmacenArchivosMemoria {
  caido = false;
  readonly firmasEnTransaccion: boolean[] = [];
  readonly descargasFirmadasEnTransaccion: boolean[] = [];

  constructor(
    reloj: RelojFijo,
    private readonly unidadDeTrabajo: UnidadDeTrabajoDirecta,
  ) {
    super(reloj);
  }

  override firmarCarga(ruta: string): Promise<CargaFirmada> {
    this.firmasEnTransaccion.push(this.unidadDeTrabajo.enCurso > 0);
    if (this.caido) return Promise.reject(new AlmacenNoDisponibleError('caido'));
    return super.firmarCarga(ruta);
  }

  override firmarDescarga(ruta: string, vigenciaSegundos: number, descargarComo?: string): Promise<string> {
    this.descargasFirmadasEnTransaccion.push(this.unidadDeTrabajo.enCurso > 0);
    return super.firmarDescarga(ruta, vigenciaSegundos, descargarComo);
  }

  override leer(ruta: string): Promise<Uint8Array | null> {
    if (this.caido) return Promise.reject(new AlmacenNoDisponibleError('caido'));
    return super.leer(ruta);
  }
}

export class AntivirusConFallas implements AnalizadorAntivirus {
  caido = false;
  private readonly real = new AnalizadorFirmaEicar();

  analizar(contenido: Uint8Array): Promise<ResultadoAntivirus> {
    if (this.caido) return Promise.reject(new Error('el antivirus no responde'));
    return this.real.analizar(contenido);
  }
}

/** Recuerda cada entrada y si se registró dentro de una transacción, como exige `AuditoriaPort`. */
export class AuditoriaEspia implements Pick<AuditoriaPort, 'registrar'> {
  readonly entradas: EntradaAuditoria[] = [];
  readonly registradasEnTransaccion: boolean[] = [];
  caida = false;

  constructor(private readonly unidadDeTrabajo: UnidadDeTrabajoDirecta) {}

  registrar(entrada: EntradaAuditoria): Promise<void> {
    if (this.caida) return Promise.reject(new Error('la auditoría no responde'));
    this.entradas.push(entrada);
    this.registradasEnTransaccion.push(this.unidadDeTrabajo.enCurso > 0);
    return Promise.resolve();
  }
}

/** Autorizador de prueba: responde lo que se le configure y recuerda qué entidades le preguntaron. */
export class AutorizadorFijo implements AutorizadorEntidad {
  readonly consultas: [acceso: 'leer' | 'editar', entidadId: string][] = [];
  permiteLeer = true;
  permiteEditar = true;

  constructor(readonly entidadTipo = ENTIDAD_CON_AUTORIZADOR) {}

  puedeLeer(entidadId: string): Promise<boolean> {
    this.consultas.push(['leer', entidadId]);
    return Promise.resolve(this.permiteLeer);
  }

  puedeEditar(entidadId: string): Promise<boolean> {
    this.consultas.push(['editar', entidadId]);
    return Promise.resolve(this.permiteEditar);
  }
}

export interface Dobles extends DependenciasArchivos, DependenciasAnalisis, DependenciasDescarga {
  unidadDeTrabajo: UnidadDeTrabajoDirecta;
  contexto: ContextoFijo;
  reloj: RelojFijo;
  publicador: PublicadorMemoria;
  archivos: RepositorioArchivosMemoria;
  almacen: AlmacenConFallas;
  cola: ColaMemoria;
  antivirus: AntivirusConFallas;
  autorizadores: AutorizadorFijo[];
  auditoria: AuditoriaEspia;
  canal: CanalAnalisisEspia;
}

/** Sin autorizadores registrados, como nace `AUTORIZADORES_ENTIDAD`. El detector de tipo es el real. */
export function crearDobles(): Dobles {
  const contexto = new ContextoFijo({ tenantId: TENANT_A, actorId: USUARIO });
  const unidadDeTrabajo = new UnidadDeTrabajoDirecta();
  const reloj = new RelojFijo(AHORA);
  const canal = new CanalAnalisisEspia(unidadDeTrabajo);
  return {
    unidadDeTrabajo,
    contexto,
    reloj,
    ids: new IdsEnOrden(),
    publicador: new PublicadorMemoria(unidadDeTrabajo),
    archivos: new RepositorioArchivosMemoria(contexto),
    almacen: new AlmacenConFallas(reloj, unidadDeTrabajo),
    cola: new ColaMemoria(),
    detector: new DetectorTipoFileType(),
    antivirus: new AntivirusConFallas(),
    autorizadores: [],
    auditoria: new AuditoriaEspia(unidadDeTrabajo),
    canal,
    alFallarCanal: (error) => canal.fallas.push(error),
  };
}
