import type { CanalNotificacion } from '../../domain/canal.js';
import type { EstadoMensaje } from '../../domain/estado-mensaje.js';
import type { FinalidadNotificacion } from '../../domain/finalidad-notificacion.js';
import type { IntentoEntrega } from '../../domain/intento-entrega.js';
import { Mensaje, type DatosMensaje } from '../../domain/mensaje.js';
import type { Plantilla } from '../../domain/plantilla.js';
import type { FilaIntentoEntrega, FilaMensaje, FilaPlantilla } from './entidades.js';

// Los CHECK de la tabla garantizan que canal, estado y finalidad son de la lista.

type FilaMensajeNueva = Omit<FilaMensaje, 'creadoEn'>;
type CambiosMensaje = Pick<FilaMensaje, 'estado' | 'idExterno' | 'motivoFallo' | 'enviadoEn' | 'entregadoEn' | 'modificadoEn'>;

export function plantillaDesdeFila(fila: FilaPlantilla): Plantilla {
  return {
    id: fila.id,
    tenantId: fila.tenantId,
    codigo: fila.codigo,
    canal: fila.canal as CanalNotificacion,
    idioma: fila.idioma,
    version: fila.version,
    asunto: fila.asunto,
    cuerpo: fila.cuerpo,
    variables: fila.variables,
    plantillaBaseId: fila.plantillaBaseId,
    activa: fila.activa,
    creadoPor: fila.creadoPor,
    creadoEn: fila.creadoEn,
  };
}

export function filaDesdePlantilla(plantilla: Plantilla): FilaPlantilla {
  return { ...plantilla, variables: plantilla.variables.map((variable) => ({ ...variable })) };
}

export function mensajeDesdeFila(fila: FilaMensaje): Mensaje {
  return Mensaje.reconstituir({
    id: fila.id,
    tenantId: fila.tenantId,
    plantillaId: fila.plantillaId,
    canal: fila.canal as CanalNotificacion,
    destino: fila.destino,
    destinoHash: fila.destinoHash,
    personaId: fila.personaId,
    finalidad: fila.finalidad as FinalidadNotificacion,
    asunto: fila.asunto,
    cuerpo: fila.cuerpo,
    claveIdempotencia: fila.claveIdempotencia,
    estado: fila.estado as EstadoMensaje,
    idExterno: fila.idExterno,
    motivoFallo: fila.motivoFallo,
    programadoPara: fila.programadoPara,
    enviadoEn: fila.enviadoEn,
    entregadoEn: fila.entregadoEn,
    version: fila.version,
    creadoPor: fila.creadoPor,
    modificadoEn: fila.modificadoEn,
  });
}

export function filaDesdeMensaje(mensaje: Mensaje): FilaMensajeNueva {
  return mensaje.instantanea();
}

export function cambiosDeMensaje(mensaje: Mensaje): CambiosMensaje {
  const { estado, idExterno, motivoFallo, enviadoEn, entregadoEn, modificadoEn }: DatosMensaje = mensaje.instantanea();
  return { estado, idExterno, motivoFallo, enviadoEn, entregadoEn, modificadoEn };
}

export function filaDesdeIntento(intento: IntentoEntrega): FilaIntentoEntrega {
  return { ...intento, respuestaProveedor: { ...intento.respuestaProveedor } };
}
