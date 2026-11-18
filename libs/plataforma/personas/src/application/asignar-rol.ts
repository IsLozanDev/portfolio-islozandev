import { fechaCalendarioDe } from '@vitrina/plataforma/org';
import { PersonaNoEncontradaError, ProductoNoSuscritoError } from '../domain/errores.js';
import { publicarEventosDe, type DependenciasPersonas } from './dependencias-personas.js';
import type { AsignarRolComando } from './ports/persona.port.js';

/**
 * TR-RF-040: asigna a la persona un rol de un producto con suscripción vigente (TR-RN-006), desde hoy en
 * Lima. Un rol que ya está vigente no se repite ni publica evento.
 */
export class AsignarRolPersona {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  ejecutar(comando: AsignarRolComando): Promise<{ asignado: boolean }> {
    const { unidadDeTrabajo, reloj, publicador, personas, suscripciones } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const persona = await personas.obtener(comando.personaId);
      if (!persona) throw new PersonaNoEncontradaError();
      if (!(await suscripciones.estaVigente(comando.productoCodigo))) throw new ProductoNoSuscritoError();

      const asignado = persona.asignarRol(comando.productoCodigo, comando.rol, fechaCalendarioDe(reloj.now()));
      if (!asignado) return { asignado };

      await personas.guardar(persona);
      await publicarEventosDe(publicador, persona);
      return { asignado };
    });
  }
}
