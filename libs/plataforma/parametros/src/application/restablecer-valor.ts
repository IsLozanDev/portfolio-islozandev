import { ConfirmacionRequeridaError } from '@vitrina/plataforma/seguridad';
import { ParametroNoDefinidoError, ValorNoConfiguradoError } from '../domain/errores.js';
import { ambitoValor, type AlcanceParametro } from '../domain/tipos.js';
import { exigirAlcance, exigirDefinicion, type DependenciasValores } from './dependencias-valores.js';
import type { ValorEfectivo } from './ports/repositorios.js';
import { publicarEventos } from './publicar-eventos.js';

export interface RestablecerValorComando {
  codigo: string;
  alcance: AlcanceParametro;
  empresaId?: string | null;
  sucursalId?: string | null;
  /** TR-RF-033: la acción exige confirmación explícita. */
  confirmar: boolean;
  actorId: string;
}

/** TR-RF-033: borra el valor de un nivel; el nivel vuelve a heredar. Un parámetro obsoleto también se restablece. */
export class RestablecerValor {
  constructor(private readonly dependencias: DependenciasValores) {}

  ejecutar(comando: RestablecerValorComando): Promise<{ efectivo: ValorEfectivo }> {
    if (comando.confirmar !== true) throw new ConfirmacionRequeridaError();
    const ambito = ambitoValor(comando.alcance, comando.empresaId ?? null, comando.sucursalId ?? null);
    const { unidadDeTrabajo, definiciones, alcanceActor, reloj, valores, eventos, resolucion, contexto } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      await exigirDefinicion(definiciones, comando.codigo);
      const ahora = reloj.now();
      await exigirAlcance(alcanceActor, comando.actorId, ambito, ahora);

      const existente = await valores.buscar(comando.codigo, ambito);
      if (!existente) throw new ValorNoConfiguradoError();
      existente.restablecer(comando.actorId, ahora);
      await valores.eliminar(existente);
      await publicarEventos(eventos, existente);

      // Lo que hereda ahora la entidad del nivel restablecido (TR-CA-086, TR-CA-087).
      const efectivo = await resolucion.valor(comando.codigo, contexto.current().tenantId, ambito.empresaId, ambito.sucursalId);
      if (!efectivo) throw new ParametroNoDefinidoError(comando.codigo);
      return { efectivo };
    });
  }
}
