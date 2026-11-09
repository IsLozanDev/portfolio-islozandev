import { ACCION_ACCESO_SENSIBLE, validarEntradaAccesoSensible, type EntradaAccesoSensible } from '../domain/entradas.js';
import { ActorRequeridoError } from '../domain/errores.js';
import { datosDelContexto, type DependenciasRegistro } from './dependencias-registro.js';

/** TR-RF-085: quién vio qué dato sensible de qué titular y con qué finalidad (TR-RNF-016). */
export class RegistrarAccesoSensible {
  constructor(private readonly dependencias: DependenciasRegistro) {}

  async ejecutar(entrada: EntradaAccesoSensible): Promise<void> {
    validarEntradaAccesoSensible(entrada);
    const datos = datosDelContexto(this.dependencias);
    if (!datos.usuarioId) throw new ActorRequeridoError();
    await this.dependencias.registro.insertar({
      ...datos,
      tipo: 'ACCESO_SENSIBLE',
      accion: ACCION_ACCESO_SENSIBLE,
      entidadTipo: entrada.recursoTipo,
      entidadId: entrada.recursoId,
      personaTitularId: entrada.personaTitularId,
      finalidad: entrada.finalidad,
      ticket: entrada.ticket,
    });
  }
}
