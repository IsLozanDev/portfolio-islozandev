import { EmisorNoEncontradoError } from '../domain/errores.js';
import { produccionHabilitada } from '../domain/eventos-fe.js';
import { ACCIONES_EMISOR, actorDe, ENTIDAD_EMISOR, esSimulado, type DependenciasEmisor } from './dependencias-fe.js';
import { vistaDe, type VistaEmisor } from './vista-emisor.js';

type DependenciasProduccion = Pick<
  DependenciasEmisor,
  'unidadDeTrabajo' | 'contexto' | 'reloj' | 'emisores' | 'proveedores' | 'publicador' | 'auditoria' | 'entorno'
>;

/**
 * TR-RF-052, paso 5: pasa el emisor a PRODUCCION si el ambiente lo permite, el proveedor no es el simulador, hay una
 * prueba aceptada en las últimas 24 h y el certificado está vigente cuando el proveedor lo pide. No hay vuelta a BETA.
 */
export class HabilitarProduccion {
  constructor(private readonly dependencias: DependenciasProduccion) {}

  ejecutar(empresaId: string): Promise<VistaEmisor> {
    const { unidadDeTrabajo, contexto, reloj, emisores, proveedores, publicador, auditoria, entorno } = this.dependencias;
    const actorId = actorDe(contexto);
    return unidadDeTrabajo.run(async () => {
      const emisor = await emisores.porEmpresa(empresaId);
      if (!emisor) throw new EmisorNoEncontradoError();
      const proveedor = await proveedores.obtener(emisor.proveedor);
      const ahora = reloj.now();
      const antes = vistaDe(emisor);
      const versionLeida = emisor.version;

      emisor.habilitarProduccion(
        ahora,
        { produccionPermitida: entorno.produccionPermitida, esSimulado: esSimulado(proveedor), requiereCertificado: proveedor.requiereCertificado },
        actorId,
      );
      emisor.registrarModificacion(actorId, ahora);
      await emisores.actualizar(emisor, versionLeida);
      await publicador.publish(produccionHabilitada(emisor.version, emisor.cargaCambioEstado(), ahora));
      const despues = vistaDe(emisor);
      await auditoria.registrar({ accion: ACCIONES_EMISOR.habilitarProduccion, entidadTipo: ENTIDAD_EMISOR, entidadId: emisor.id, antes, despues });
      return despues;
    });
  }
}
