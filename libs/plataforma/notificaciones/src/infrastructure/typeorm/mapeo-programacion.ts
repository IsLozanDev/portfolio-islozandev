import type { FinalidadNotificacion } from '../../domain/finalidad-notificacion.js';
import { Programacion, type EstadoProgramacion } from '../../domain/programacion.js';
import type { FilaProgramacion } from './entidades.js';

// Los CHECK de la tabla garantizan que estado y finalidad son de la lista.

type FilaProgramacionNueva = Omit<FilaProgramacion, 'creadoEn'>;
type CambiosProgramacion = Pick<FilaProgramacion, 'destinatario' | 'variables' | 'finalidad' | 'enviarEn' | 'estado' | 'motivo' | 'mensajeId' | 'version' | 'modificadoEn'>;

export function programacionDesdeFila(fila: FilaProgramacion): Programacion {
  return Programacion.reconstituir({
    id: fila.id,
    tenantId: fila.tenantId,
    referencia: { tipo: fila.referenciaTipo, id: fila.referenciaId },
    plantillaCodigo: fila.plantillaCodigo,
    destinatario: fila.destinatario,
    variables: fila.variables,
    finalidad: fila.finalidad as FinalidadNotificacion,
    enviarEn: fila.enviarEn,
    estado: fila.estado as EstadoProgramacion,
    motivo: fila.motivo,
    mensajeId: fila.mensajeId,
    version: fila.version,
    creadoPor: fila.creadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

export function filaDesdeProgramacion(programacion: Programacion): FilaProgramacionNueva {
  const { referencia, ...datos } = programacion.instantanea();
  return { ...datos, ...cambiosDeProgramacion(programacion), referenciaTipo: referencia.tipo, referenciaId: referencia.id };
}

export function cambiosDeProgramacion(programacion: Programacion): CambiosProgramacion {
  const { destinatario, variables, finalidad, enviarEn, estado, motivo, mensajeId, version, modificadoEn } = programacion.instantanea();
  return { destinatario: { ...destinatario }, variables: { ...variables }, finalidad, enviarEn, estado, motivo, mensajeId, version, modificadoEn };
}
