import { EmisorNoEncontradoError } from '../domain/errores.js';
import { pruebaSolicitada } from '../domain/eventos-fe.js';
import { ACCIONES_EMISOR, actorDe, ENTIDAD_EMISOR, type DependenciasEmisor } from './dependencias-fe.js';
import { vistaDe, type VistaEmisor } from './vista-emisor.js';

type DependenciasSolicitud = Pick<DependenciasEmisor, 'unidadDeTrabajo' | 'contexto' | 'reloj' | 'emisores' | 'publicador' | 'auditoria'>;

/**
 * TR-RF-052, paso 4: deja la prueba EN_PROCESO y publica `fe.prueba.solicitada` por outbox en la misma transacción.
 * No llama al PSE: un PSE lento o caído no retiene la petición, y una caída de Redis no pierde la solicitud.
 */
export class SolicitarPruebaEmisor {
  constructor(private readonly dependencias: DependenciasSolicitud) {}

  ejecutar(empresaId: string): Promise<VistaEmisor> {
    const { unidadDeTrabajo, contexto, reloj, emisores, publicador, auditoria } = this.dependencias;
    const actorId = actorDe(contexto);
    return unidadDeTrabajo.run(async () => {
      const emisor = await emisores.porEmpresa(empresaId);
      if (!emisor) throw new EmisorNoEncontradoError();
      const ahora = reloj.now();
      const antes = emisor.prueba;
      const versionLeida = emisor.version;

      const numeroPrueba = emisor.solicitarPrueba(ahora);
      emisor.registrarModificacion(actorId, ahora);
      await emisores.actualizar(emisor, versionLeida);
      await publicador.publish(pruebaSolicitada(emisor.version, { emisor_id: emisor.id, numero_prueba: numeroPrueba }, ahora));
      await auditoria.registrar({
        accion: ACCIONES_EMISOR.solicitarPrueba,
        entidadTipo: ENTIDAD_EMISOR,
        entidadId: emisor.id,
        antes,
        despues: emisor.prueba,
      });
      return vistaDe(emisor);
    });
  }
}
