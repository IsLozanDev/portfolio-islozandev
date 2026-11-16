import type { ConfiguracionCuota, IncluidasPorPlan } from '@vitrina/plataforma/identidad';
import { ParametroNoDefinidoError, type ParametroPort, type RepositorioDefiniciones } from '@vitrina/plataforma/parametros';

const PRODUCTO_PLATAFORMA = 'PLAT';
const PARAMETRO_INCLUIDAS = 'plat.identidad.cuota_incluidas';
const PARAMETRO_UMBRAL = 'plat.identidad.cuota_umbral_aviso';
const ORIGEN_DEFINICION = 'DEFECTO';
const UMBRAL_POR_DEFECTO = 80;
const UMBRAL_MINIMO = 1;
const UMBRAL_MAXIMO = 100;

export interface DependenciasConfiguracionCuota {
  parametros: Pick<ParametroPort, 'valor'>;
  definiciones: RepositorioDefiniciones;
  avisar: (mensaje: string, datos: Record<string, unknown>) => void;
}

/** Parámetros de la cuota de idn por cfg (TR-RNF-119). Vive aquí porque idn no importa cfg. */
export class ConfiguracionCuotaParametros implements ConfiguracionCuota {
  constructor(private readonly dependencias: DependenciasConfiguracionCuota) {}

  /**
   * Solo vale el valor por defecto del manifiesto: cambiar las incluidas de un plan exige una versión nueva.
   * Si el tenant fijó un valor propio se ignora y se avisa en el log.
   */
  async incluidasPorPlan(): Promise<IncluidasPorPlan> {
    const { valor, origen } = await this.dependencias.parametros.valor<IncluidasPorPlan>(PARAMETRO_INCLUIDAS);
    if (origen === ORIGEN_DEFINICION) return valor;
    this.dependencias.avisar('Valor propio de la cuota ignorado: vale el del manifiesto', { codigo: PARAMETRO_INCLUIDAS, origen });
    return this.valorDeLaDefinicion();
  }

  async umbralAvisoPorcentaje(): Promise<number> {
    const { valor } = await this.dependencias.parametros.valor<number>(PARAMETRO_UMBRAL);
    if (esUmbralValido(valor)) return valor;
    this.dependencias.avisar('Umbral de aviso de cuota fuera de rango: se usa el por defecto', { codigo: PARAMETRO_UMBRAL, valor });
    return UMBRAL_POR_DEFECTO;
  }

  private async valorDeLaDefinicion(): Promise<IncluidasPorPlan> {
    const definiciones = await this.dependencias.definiciones.transaccion((sesion) => sesion.todasDe(PRODUCTO_PLATAFORMA));
    const definicion = definiciones.find((candidata) => candidata.codigo === PARAMETRO_INCLUIDAS);
    if (!definicion) throw new ParametroNoDefinidoError(PARAMETRO_INCLUIDAS);
    return definicion.valorDefecto as IncluidasPorPlan;
  }
}

function esUmbralValido(valor: unknown): valor is number {
  return typeof valor === 'number' && valor >= UMBRAL_MINIMO && valor <= UMBRAL_MAXIMO;
}
