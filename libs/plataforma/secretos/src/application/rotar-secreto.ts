import { datosAsociadosSecreto } from '../domain/datos-asociados.js';
import { SecretoNoEncontradoError, SecretoSinActorError } from '../domain/errores.js';
import { exigirValorSecreto } from '../domain/valor-secreto.js';
import { ACCIONES_SECRETO, ENTIDAD_SECRETO, type DependenciasBoveda } from './dependencias-boveda.js';

/**
 * Cambia el valor conservando el id: IV nuevo, versión + 1 con bloqueo optimista. Quien leyó antes de confirmar
 * sigue con el valor anterior y quien lee después, con el nuevo: no hay ventana sin valor.
 */
export class RotarSecreto {
  constructor(private readonly dependencias: DependenciasBoveda) {}

  async ejecutar(secretoId: string, valor: Uint8Array): Promise<void> {
    const { unidadDeTrabajo, contexto, reloj, cifrador, clavesDeDatos, secretos, auditoria } = this.dependencias;
    exigirValorSecreto(valor);
    clavesDeDatos.exigirMaestras();
    const { actorId } = contexto.current();
    if (!actorId) throw new SecretoSinActorError();

    await unidadDeTrabajo.run(async () => {
      const secreto = await secretos.obtener(secretoId);
      if (!secreto) throw new SecretoNoEncontradoError();
      const claveDatos = await clavesDeDatos.obtenerExistente();
      const { cifrado, iv } = cifrador.cifrar(claveDatos, valor, datosAsociadosSecreto(secreto.tenantId, secreto.id, secreto.tipo));
      await secretos.actualizar({ ...secreto, cifrado, iv, rotadoPor: actorId, rotadoEn: reloj.now() }, secreto.version);
      await auditoria.registrar({
        accion: ACCIONES_SECRETO.rotar,
        entidadTipo: ENTIDAD_SECRETO,
        entidadId: secretoId,
        despues: { tipo: secreto.tipo, version: secreto.version + 1 },
      });
    });
  }
}
