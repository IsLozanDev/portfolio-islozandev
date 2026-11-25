import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { DependenciasBarrido, DependenciasEjecucion, DependenciasProgramacion } from '../../src/application/dependencias.js';
import { EnviarNotificacion } from '../../src/application/enviar-notificacion.js';
import type { ColaProgramaciones, TrabajoProgramacion } from '../../src/application/ports/cola-programaciones.js';
import type { LocalizadorProgramaciones, ProgramacionAtrasada, RepositorioProgramaciones } from '../../src/application/ports/repositorios.js';
import { ProgramacionModificadaError } from '../../src/domain/errores.js';
import { Programacion } from '../../src/domain/programacion.js';
import type { ReferenciaProgramacion } from '../../src/domain/referencia-programacion.js';
import { escenario } from './dobles.js';

/** Un mapa por id; tenant, referencia y la viva única se filtran como en la base. */
export class ProgramacionesMemoria implements RepositorioProgramaciones {
  readonly filas = new Map<string, Programacion>();

  constructor(private readonly contexto: TenantContext) {}

  async obtener(programacionId: string): Promise<Programacion | null> {
    const fila = this.filas.get(programacionId);
    if (!fila || fila.instantanea().tenantId !== this.tenantId) return null;
    return Programacion.reconstituir(fila.instantanea());
  }

  async vivas(referencia: ReferenciaProgramacion, plantillaCodigo?: string): Promise<Programacion[]> {
    return [...this.filas.values()]
      .filter((programacion) => {
        const datos = programacion.instantanea();
        return (
          datos.tenantId === this.tenantId &&
          datos.estado === 'PROGRAMADA' &&
          datos.referencia.tipo === referencia.tipo &&
          datos.referencia.id === referencia.id &&
          (plantillaCodigo === undefined || datos.plantillaCodigo === plantillaCodigo)
        );
      })
      .map((programacion) => Programacion.reconstituir(programacion.instantanea()));
  }

  async insertar(programacion: Programacion): Promise<void> {
    const { referencia, plantillaCodigo } = programacion.instantanea();
    if ((await this.vivas(referencia, plantillaCodigo)).length > 0) throw new ProgramacionModificadaError();
    this.filas.set(programacion.id, Programacion.reconstituir(programacion.instantanea()));
  }

  async actualizar(programacion: Programacion, versionEsperada: number): Promise<void> {
    const actual = this.filas.get(programacion.id);
    if (!actual || actual.version !== versionEsperada) throw new ProgramacionModificadaError();
    this.filas.set(programacion.id, Programacion.reconstituir(programacion.instantanea()));
  }

  guardada(programacionId: string): Programacion {
    const fila = this.filas.get(programacionId);
    if (!fila) throw new Error(`Sin programación ${programacionId}`);
    return fila;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

/** Como BullMQ con `jobId = ${programacionId}-${version}`: un id repetido no duplica. */
export class ColaProgramacionesMemoria implements ColaProgramaciones {
  readonly trabajos = new Map<string, TrabajoProgramacion & { enviarEn: Date }>();

  async encolar(trabajo: TrabajoProgramacion & { enviarEn: Date }): Promise<void> {
    const jobId = `${trabajo.programacionId}-${trabajo.version}`;
    if (!this.trabajos.has(jobId)) this.trabajos.set(jobId, trabajo);
  }
}

/** Cruza tenants como la función SECURITY DEFINER. */
export class LocalizadorProgramacionesMemoria implements LocalizadorProgramaciones {
  readonly cortes: { antes: Date; limite: number }[] = [];

  constructor(private readonly programaciones: ProgramacionesMemoria) {}

  async atrasadas(antes: Date, limite: number): Promise<ProgramacionAtrasada[]> {
    this.cortes.push({ antes, limite });
    return [...this.programaciones.filas.values()]
      .map((programacion) => programacion.instantanea())
      .filter((datos) => datos.estado === 'PROGRAMADA' && datos.enviarEn.getTime() < antes.getTime())
      .sort((una, otra) => una.enviarEn.getTime() - otra.enviarEn.getTime())
      .slice(0, limite)
      .map(({ id, tenantId, version }) => ({ programacionId: id, tenantId, version }));
  }
}

/** Las piezas del escenario de envío más las de programaciones; la ejecución llama al EnviarNotificacion en memoria. */
export function escenarioProgramaciones() {
  const piezas = escenario();
  const programaciones = new ProgramacionesMemoria(piezas.contexto);
  const cola = new ColaProgramacionesMemoria();
  const localizador = new LocalizadorProgramacionesMemoria(programaciones);
  const enviar = new EnviarNotificacion(piezas.envio);
  const programacion: DependenciasProgramacion = {
    unidadDeTrabajo: piezas.envio.unidadDeTrabajo,
    contexto: piezas.contexto,
    reloj: piezas.reloj,
    ids: piezas.envio.ids,
    publicador: piezas.publicador,
    plantillas: piezas.plantillas,
    programaciones,
  };
  const ejecucion: DependenciasEjecucion = {
    unidadDeTrabajo: piezas.envio.unidadDeTrabajo,
    contexto: piezas.contexto,
    reloj: piezas.reloj,
    programaciones,
    notificaciones: enviar,
  };
  const barrido: DependenciasBarrido = { reloj: piezas.reloj, cola, localizador };
  return { ...piezas, programaciones, cola, localizador, enviar, programacion, ejecucion, barrido };
}
