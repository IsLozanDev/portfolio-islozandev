import { datosAsociadosSecreto } from '../domain/datos-asociados.js';
import { SecretoSinActorError } from '../domain/errores.js';
import { exigirTipoSecreto } from '../domain/tipo-secreto.js';
import { exigirValorSecreto } from '../domain/valor-secreto.js';
import { ACCIONES_SECRETO, ENTIDAD_SECRETO, type DependenciasBoveda } from './dependencias-boveda.js';

const PRIMERA_VERSION = 1;

/** Cifra el valor con la clave de datos del tenant (la crea en su primer secreto), lo inserta y lo audita sin el valor. */
export class GuardarSecreto {
  constructor(private readonly dependencias: DependenciasBoveda) {}

  async ejecutar(tipo: string, valor: Uint8Array): Promise<string> {
    const { unidadDeTrabajo, contexto, ids, cifrador, clavesDeDatos, secretos, auditoria } = this.dependencias;
    const tipoSecreto = exigirTipoSecreto(tipo);
    exigirValorSecreto(valor);
    clavesDeDatos.exigirMaestras();
    const { tenantId, actorId } = contexto.current();
    if (!actorId) throw new SecretoSinActorError();

    return unidadDeTrabajo.run(async () => {
      const claveDatos = await clavesDeDatos.obtenerOCrear(tenantId);
      const id = ids.next();
      const { cifrado, iv } = cifrador.cifrar(claveDatos, valor, datosAsociadosSecreto(tenantId, id, tipoSecreto));
      await secretos.insertar({
        id,
        tenantId,
        tipo: tipoSecreto,
        cifrado,
        iv,
        version: PRIMERA_VERSION,
        creadoPor: actorId,
        rotadoPor: null,
        rotadoEn: null,
      });
      await auditoria.registrar({ accion: ACCIONES_SECRETO.guardar, entidadTipo: ENTIDAD_SECRETO, entidadId: id, despues: { tipo: tipoSecreto } });
      return id;
    });
  }
}
