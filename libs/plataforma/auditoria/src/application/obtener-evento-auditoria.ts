import { calcularCambios, type Cambio } from '../domain/cambios.js';
import { EventoAuditoriaNoEncontradoError } from '../domain/errores.js';
import { FORMATO_UUID } from '../domain/filtro-auditoria.js';
import { PERMISOS_AUD } from '../domain/permisos-aud.js';
import { alcanceDelActor, nombresDe } from './alcance-auditoria.js';
import { conNombres, type DependenciasConsultaAuditoria, type EventoAuditoriaListado } from './consultar-auditoria.js';
import type { EventoAuditoriaCompleto } from './ports/lectura-auditoria.port.js';

export type DetalleEventoAuditoria = EventoAuditoriaCompleto & Pick<EventoAuditoriaListado, 'usuario' | 'sucursal'> & { cambios: Cambio[] };

/**
 * Fila completa con `antes`, `despues` y sus diferencias. Fuera del alcance del actor o de otro tenant
 * responde que no existe: no revela que está (TR-CA-214).
 */
export class ObtenerEventoAuditoria {
  constructor(private readonly dependencias: DependenciasConsultaAuditoria) {}

  async ejecutar(id: string): Promise<DetalleEventoAuditoria> {
    if (!FORMATO_UUID.test(id)) throw new EventoAuditoriaNoEncontradoError();
    const { unidadDeTrabajo, lectura, directorio } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const alcance = await alcanceDelActor(this.dependencias, PERMISOS_AUD.consultar);
      const evento = await lectura.buscar(id, alcance);
      if (!evento) throw new EventoAuditoriaNoEncontradoError();
      const nombres = await nombresDe(directorio, [evento]);
      return { ...conNombres(evento, nombres), cambios: calcularCambios(evento.antes, evento.despues) };
    });
  }
}
