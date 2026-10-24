import { AggregateRoot } from '@vitrina/plataforma/kernel';
import { EVENTOS_CFG, type ParametroCambiado } from './eventos.js';
import { igualJson } from './json.js';
import type { AmbitoValor } from './tipos.js';

export interface ValorParametroProps {
  tenantId: string;
  codigo: string;
  ambito: AmbitoValor;
  valor: unknown;
  modificadoPor: string;
  modificadoEn: Date;
}

/** Valor de un parámetro en un nivel (TR-RF-031). Tipo, esquema y alcance los valida la definición. */
export class ValorParametro extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private props: ValorParametroProps,
  ) {
    super(id, version);
  }

  static fijar(d: { id: string; tenantId: string; codigo: string; ambito: AmbitoValor; valor: unknown; por: string; ahora: Date }): ValorParametro {
    const v = new ValorParametro(d.id, 0, {
      tenantId: d.tenantId,
      codigo: d.codigo,
      ambito: d.ambito,
      valor: d.valor,
      modificadoPor: d.por,
      modificadoEn: d.ahora,
    });
    v.publicar(null, d.valor, false, d.por);
    return v;
  }

  static reconstituir(id: string, version: number, props: ValorParametroProps): ValorParametro {
    return new ValorParametro(id, version, { ...props });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get ambito(): AmbitoValor {
    return this.props.ambito;
  }

  get valor(): unknown {
    return this.props.valor;
  }

  get modificadoPor(): string {
    return this.props.modificadoPor;
  }

  get modificadoEn(): Date {
    return this.props.modificadoEn;
  }

  /** false si el valor es igual al guardado: no escribe ni publica (TR-RNF-008). */
  cambiar(valor: unknown, por: string, ahora: Date): boolean {
    if (igualJson(this.props.valor, valor)) return false;
    const anterior = this.props.valor;
    this.props = { ...this.props, valor, modificadoPor: por, modificadoEn: ahora };
    this.publicar(anterior, valor, false, por);
    return true;
  }

  /** TR-RF-033: el repositorio borra la fila; el nivel vuelve a heredar. */
  restablecer(por: string, ahora: Date): void {
    this.props = { ...this.props, modificadoPor: por, modificadoEn: ahora };
    this.publicar(this.props.valor, null, true, por);
  }

  private publicar(anterior: unknown, valor: unknown, restablecido: boolean, por: string): void {
    const payload: ParametroCambiado = {
      codigo: this.props.codigo,
      alcance: this.props.ambito.alcance,
      empresa_id: this.props.ambito.empresaId,
      sucursal_id: this.props.ambito.sucursalId,
      valor_anterior: anterior,
      valor,
      restablecido,
      por,
    };
    this.raise({ eventType: EVENTOS_CFG.parametroCambiado, aggregateType: 'parametro_valor', schemaVersion: 1, payload });
  }
}
