import { ConflictError, DomainError } from '@vitrina/plataforma/kernel';
import type { EstadoMensaje } from '../../domain/estado-mensaje.js';
import type { Programacion } from '../../domain/programacion.js';
import type { DependenciasEjecucion } from '../dependencias.js';
import type { TrabajoProgramacion } from '../ports/cola-programaciones.js';

const ESTADOS_DESCARTADOS: readonly EstadoMensaje[] = ['OMITIDO_SIN_CONSENTIMIENTO', 'DESCARTADO'];

/** SIN_EFECTO: ya no estaba PROGRAMADA o el trabajo era de una versión anterior. */
export type ResultadoEjecucion = 'ENVIADA' | 'DESCARTADA' | 'SIN_EFECTO';

/**
 * Procesador de `not-programaciones`, con el contexto del tenant del trabajo y en una transacción: relee la
 * programación y, si sigue viva en la versión del trabajo, llama a `enviar` con `claveIdempotencia` = id de la
 * programación (una ejecución repetida no duplica el mensaje). `enviar` revalida TR-RN-025 y renderiza con la
 * plantilla vigente a la hora.
 * Un error de dominio de `enviar` (p. ej. la persona ya no tiene correo) la deja DESCARTADA con su código: reintentar
 * no lo arregla y el barrido la volvería a encolar sin fin. Un conflicto u otro error se relanza y BullMQ reintenta.
 */
export class EjecutarProgramacion {
  constructor(private readonly dependencias: DependenciasEjecucion) {}

  ejecutar(trabajo: TrabajoProgramacion): Promise<ResultadoEjecucion> {
    const { contexto, unidadDeTrabajo } = this.dependencias;
    return contexto.run({ tenantId: trabajo.tenantId }, () => unidadDeTrabajo.run(() => this.ejecutarVigente(trabajo)));
  }

  private async ejecutarVigente(trabajo: TrabajoProgramacion): Promise<ResultadoEjecucion> {
    const programacion = await this.dependencias.programaciones.obtener(trabajo.programacionId);
    if (!programacion?.estaViva || programacion.version !== trabajo.version) return 'SIN_EFECTO';
    const versionLeida = programacion.version;
    const resultado = await this.enviar(programacion);
    await this.dependencias.programaciones.actualizar(programacion, versionLeida);
    return resultado;
  }

  private async enviar(programacion: Programacion): Promise<ResultadoEjecucion> {
    const { plantillaCodigo, destinatario, variables, finalidad } = programacion.instantanea();
    const ahora = this.dependencias.reloj.now();
    try {
      const registrada = await this.dependencias.notificaciones.enviar({
        plantilla: plantillaCodigo,
        destinatario,
        variables,
        finalidad,
        claveIdempotencia: programacion.id,
      });
      if (ESTADOS_DESCARTADOS.includes(registrada.estado)) {
        programacion.descartar(registrada.estado, registrada.mensajeId, ahora);
        return 'DESCARTADA';
      }
      programacion.marcarEnviada(registrada.mensajeId, ahora);
      return 'ENVIADA';
    } catch (error) {
      if (!esDefinitivo(error)) throw error;
      programacion.descartar(error.code, null, ahora);
      return 'DESCARTADA';
    }
  }
}

function esDefinitivo(error: unknown): error is DomainError {
  return error instanceof DomainError && !(error instanceof ConflictError);
}
