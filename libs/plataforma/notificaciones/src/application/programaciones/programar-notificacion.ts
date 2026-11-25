import { CANAL_CORREO, exigirCanalHabilitado } from '../../domain/canal.js';
import { PlantillaNoEncontradaError, PromocionalSinPersonaError } from '../../domain/errores.js';
import { AGREGADO_PROGRAMACION, EVENTOS_NOT, VERSION_ESQUEMA_NOT, type ProgramacionRegistrada } from '../../domain/eventos-not.js';
import { FINALIDAD_PROMOCIONAL } from '../../domain/finalidad-notificacion.js';
import { IDIOMA_POR_DEFECTO } from '../../domain/plantilla.js';
import { Programacion, type DatosProgramables } from '../../domain/programacion.js';
import { validarReferencia, type ReferenciaProgramacion } from '../../domain/referencia-programacion.js';
import { renderizar } from '../../domain/renderizador-plantilla.js';
import type { DependenciasProgramacion } from '../dependencias.js';
import type { NotificacionProgramada, ProgramarNotificacionComando } from '../ports/notificacion.port.js';

/**
 * TR-RF-076. Guarda en `ntf.programacion` un envío futuro por referencia y publica `not.programacion.registrada`
 * por outbox, en la transacción del llamador (regla 4). Con una viva de la misma referencia y plantilla la
 * reprograma: un solo trabajo vivo por referencia y plantilla.
 */
export class ProgramarNotificacion {
  constructor(private readonly dependencias: DependenciasProgramacion) {}

  async ejecutar(comando: ProgramarNotificacionComando): Promise<NotificacionProgramada> {
    exigirCanalHabilitado(comando.canal ?? CANAL_CORREO);
    const referencia = validarReferencia(comando.referencia);
    if (comando.finalidad === FINALIDAD_PROMOCIONAL && !('personaId' in comando.destinatario)) throw new PromocionalSinPersonaError();
    return this.dependencias.unidadDeTrabajo.run(() => this.registrar(comando, referencia));
  }

  private async registrar(comando: ProgramarNotificacionComando, referencia: ReferenciaProgramacion): Promise<NotificacionProgramada> {
    await this.validarPlantilla(comando);
    const programables: DatosProgramables = {
      destinatario: comando.destinatario,
      variables: comando.variables,
      finalidad: comando.finalidad,
      enviarEn: comando.enviarEn,
    };
    const [viva] = await this.dependencias.programaciones.vivas(referencia, comando.plantilla);
    const programacion = viva ? await this.reprogramar(viva, programables) : await this.crear(comando, referencia, programables);
    await this.publicarRegistro(programacion);
    return { programacionId: programacion.id, enviarEn: programacion.enviarEn, reprogramada: viva !== undefined };
  }

  /** La plantilla debe existir y aceptar las variables; a la hora se renderiza con la vigente de ese momento. */
  private async validarPlantilla(comando: ProgramarNotificacionComando): Promise<void> {
    const plantilla = await this.dependencias.plantillas.vigente(comando.plantilla, CANAL_CORREO, IDIOMA_POR_DEFECTO);
    if (!plantilla) throw new PlantillaNoEncontradaError(comando.plantilla);
    renderizar(plantilla, comando.variables);
  }

  private async reprogramar(viva: Programacion, programables: DatosProgramables): Promise<Programacion> {
    const versionLeida = viva.version;
    viva.reprogramar(programables, this.dependencias.reloj.now());
    await this.dependencias.programaciones.actualizar(viva, versionLeida);
    return viva;
  }

  private async crear(comando: ProgramarNotificacionComando, referencia: ReferenciaProgramacion, programables: DatosProgramables): Promise<Programacion> {
    const { ids, contexto, reloj, programaciones } = this.dependencias;
    const { tenantId, actorId } = contexto.current();
    const nueva = Programacion.programar(
      { id: ids.next(), tenantId, referencia, plantillaCodigo: comando.plantilla, creadoPor: actorId ?? null, ...programables },
      reloj.now(),
    );
    await programaciones.insertar(nueva);
    return nueva;
  }

  private async publicarRegistro(programacion: Programacion): Promise<void> {
    const payload: ProgramacionRegistrada = {
      programacion_id: programacion.id,
      version: programacion.version,
      enviar_en: programacion.enviarEn.toISOString(),
    };
    await this.dependencias.publicador.publish({
      eventType: EVENTOS_NOT.programacionRegistrada,
      aggregateType: AGREGADO_PROGRAMACION,
      aggregateId: programacion.id,
      aggregateVersion: programacion.version,
      schemaVersion: VERSION_ESQUEMA_NOT,
      payload,
      occurredAt: this.dependencias.reloj.now(),
    });
  }
}
