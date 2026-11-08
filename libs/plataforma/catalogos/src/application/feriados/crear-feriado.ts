import { Feriado, VERSION_INICIAL_FERIADO } from '../../domain/feriados/feriado.js';
import type { AlcanceFeriado } from '../../domain/feriados/tipos.js';
import { exigirOperador } from '../dependencias-catalogos.js';
import { exigirSinDuplicado, guardarFeriado, publicarFeriado, type DependenciasFeriados } from './dependencias-feriados.js';
import { feriadoGuardadoDe, type FeriadoGuardado } from './resultados.js';

export interface CrearFeriadoComando {
  alcance: AlcanceFeriado;
  sucursalId: string | null;
  fecha: string;
  nombre: string;
  recurrenteAnual: boolean;
  actorId: string;
}

/**
 * TR-RF-029: feriado global (solo el operador, TR-RN-012), del tenant o de una de sus sucursales. El tenant sale
 * del contexto, nunca del cuerpo (TR-RN-001), y un feriado propio no exige cambios de código (TR-RNF-027).
 */
export class CrearFeriado {
  constructor(private readonly dependencias: DependenciasFeriados) {}

  ejecutar(comando: CrearFeriadoComando): Promise<FeriadoGuardado> {
    const { unidadDeTrabajo, contexto, ids, reloj, feriados } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const esGlobal = comando.alcance === 'GLOBAL';
      if (esGlobal) await exigirOperador(this.dependencias);
      const ahora = reloj.now();
      const feriado = Feriado.crear({
        id: ids.next(),
        alcance: comando.alcance,
        tenantId: esGlobal ? null : contexto.current().tenantId,
        sucursalId: comando.sucursalId,
        fecha: comando.fecha,
        nombre: comando.nombre,
        recurrenteAnual: comando.recurrenteAnual,
        por: comando.actorId,
        ahora,
      });
      await exigirSinDuplicado(feriados, feriado, null);

      await guardarFeriado(feriados, feriado, null);
      await publicarFeriado(this.dependencias, { feriado, accion: 'CREADO', version: VERSION_INICIAL_FERIADO, actorId: comando.actorId, ahora });
      return feriadoGuardadoDe(feriado, VERSION_INICIAL_FERIADO);
    });
  }
}
