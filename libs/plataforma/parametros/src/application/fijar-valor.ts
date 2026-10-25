import { ParametroObsoletoError } from '../domain/errores.js';
import { ambitoValor, type AlcanceParametro, type AmbitoValor } from '../domain/tipos.js';
import { ValorParametro } from '../domain/valor-parametro.js';
import { exigirAlcance, exigirDefinicion, type DependenciasValores } from './dependencias-valores.js';
import { publicarEventos } from './publicar-eventos.js';

export interface FijarValorComando {
  codigo: string;
  alcance: AlcanceParametro;
  empresaId?: string | null;
  sucursalId?: string | null;
  valor: unknown;
  /** Usuario que ejecuta (sub del token). */
  actorId: string;
}

export interface ValorFijado extends AmbitoValor {
  valor: unknown;
  modificadoEn: Date;
  /** false si el valor ya era ese: no se escribió ni se publicó (TR-RNF-008). */
  cambiado: boolean;
}

/** TR-RF-031: fija el valor de un parámetro en un nivel (tenant, empresa o sucursal). */
export class FijarValor {
  constructor(private readonly dependencias: DependenciasValores) {}

  ejecutar(comando: FijarValorComando): Promise<ValorFijado> {
    const ambito = ambitoValor(comando.alcance, comando.empresaId ?? null, comando.sucursalId ?? null);
    const { unidadDeTrabajo, definiciones, esquemas, alcanceActor, reloj, valores, eventos } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const definicion = await exigirDefinicion(definiciones, comando.codigo);
      if (definicion.obsoleto) throw new ParametroObsoletoError(comando.codigo);
      definicion.admite(ambito.alcance);
      definicion.validarValor(comando.valor, esquemas);
      const ahora = reloj.now();
      await exigirAlcance(alcanceActor, comando.actorId, ambito, ahora);

      const existente = await valores.buscar(comando.codigo, ambito);
      if (existente && !existente.cambiar(comando.valor, comando.actorId, ahora)) return valorFijado(existente, false);

      const valorParametro = existente ?? this.crear(comando, ambito, ahora);
      await valores.guardar(valorParametro);
      await publicarEventos(eventos, valorParametro);
      return valorFijado(valorParametro, true);
    });
  }

  private crear(comando: FijarValorComando, ambito: AmbitoValor, ahora: Date): ValorParametro {
    return ValorParametro.fijar({
      id: this.dependencias.ids.next(),
      tenantId: this.dependencias.contexto.current().tenantId,
      codigo: comando.codigo,
      ambito,
      valor: comando.valor,
      por: comando.actorId,
      ahora,
    });
  }
}

function valorFijado(valorParametro: ValorParametro, cambiado: boolean): ValorFijado {
  return { ...valorParametro.ambito, valor: valorParametro.valor, modificadoEn: valorParametro.modificadoEn, cambiado };
}
