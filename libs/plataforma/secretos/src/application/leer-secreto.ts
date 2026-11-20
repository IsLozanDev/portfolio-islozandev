import { datosAsociadosSecreto } from '../domain/datos-asociados.js';
import { SecretoNoEncontradoError } from '../domain/errores.js';
import type { DependenciasBoveda } from './dependencias-boveda.js';

const EVENTO_LECTURA = 'sec.secreto.leido';

/** Desenvuelve la clave de datos con la versión de maestra de su fila y descifra. Sin auditoría: solo log. */
export class LeerSecreto {
  constructor(private readonly dependencias: DependenciasBoveda) {}

  async ejecutar(secretoId: string): Promise<Uint8Array> {
    const { unidadDeTrabajo, cifrador, clavesDeDatos, secretos, informar } = this.dependencias;
    clavesDeDatos.exigirMaestras();

    return unidadDeTrabajo.run(async () => {
      const secreto = await secretos.obtener(secretoId);
      if (!secreto) throw new SecretoNoEncontradoError();
      const claveDatos = await clavesDeDatos.obtenerExistente();
      const valor = cifrador.descifrar(claveDatos, secreto.cifrado, secreto.iv, datosAsociadosSecreto(secreto.tenantId, secreto.id, secreto.tipo));
      informar(EVENTO_LECTURA, { secretoId, tipo: secreto.tipo });
      return valor;
    });
  }
}
