import { CodigoParametro } from './codigo-parametro.js';
import { AlcanceNoPermitidoError, DefinicionInvalidaError, ValorInvalidoError } from './errores.js';
import { igualJson } from './json.js';
import { ALCANCES_PARAMETRO, RANGO_ALCANCE, TIPOS_PARAMETRO, type AlcanceParametro, type TipoParametro } from './tipos.js';
import type { ValidadorEsquema } from './validador-esquema.js';

export interface DatosDefinicion {
  codigo: string;
  productoCodigo: string;
  descripcion: string;
  tipo: TipoParametro;
  valorDefecto: unknown;
  alcanceMaximo: AlcanceParametro;
  esquema: object | null;
}

export interface DefinicionProps extends DatosDefinicion {
  obsoleto: boolean;
}

const CUMPLE_TIPO: Record<TipoParametro, (valor: unknown) => boolean> = {
  TEXTO: (valor) => typeof valor === 'string',
  NUMERO: (valor) => typeof valor === 'number' && Number.isFinite(valor),
  BOOLEANO: (valor) => typeof valor === 'boolean',
  JSON: (valor) => valor !== null && typeof valor === 'object',
};

/** Definición global de un parámetro, declarada en el manifiesto del producto (TR-RF-030). */
export class DefinicionParametro {
  private constructor(private readonly props: DefinicionProps) {}

  /** Junta todos los errores antes de rechazar: el manifiesto los informa juntos. */
  static crear(datos: DatosDefinicion, esquemas: ValidadorEsquema): DefinicionParametro {
    const detalles: string[] = [];
    const anotar = (campo: string, validacion: () => void): void => {
      try {
        validacion();
      } catch (error) {
        detalles.push(`${campo}: ${(error as Error).message}`);
      }
    };

    anotar('codigo', () => CodigoParametro.de(datos.codigo, datos.productoCodigo));
    const descripcion = typeof datos.descripcion === 'string' ? datos.descripcion.trim() : '';
    if (descripcion.length < 3 || descripcion.length > 250) detalles.push('descripcion: debe tener entre 3 y 250 caracteres');
    const tipoValido = TIPOS_PARAMETRO.includes(datos.tipo);
    if (!tipoValido) detalles.push(`tipo: debe ser uno de ${TIPOS_PARAMETRO.join(', ')}`);
    if (!ALCANCES_PARAMETRO.includes(datos.alcanceMaximo)) detalles.push(`alcance_maximo: debe ser uno de ${ALCANCES_PARAMETRO.join(', ')}`);

    const esquema = datos.esquema ?? null;
    let esquemaValido = true;
    if (esquema !== null) {
      const problemas = typeof esquema === 'object' && !Array.isArray(esquema) ? esquemas.soporta(esquema) : ['debe ser un objeto'];
      esquemaValido = problemas.length === 0;
      for (const problema of problemas) detalles.push(`esquema: ${problema}`);
    }

    const definicion = new DefinicionParametro({ ...datos, descripcion, esquema, obsoleto: false });
    if (tipoValido && esquemaValido) anotar('valor_defecto', () => definicion.validarValor(datos.valorDefecto, esquemas));

    if (detalles.length > 0) throw new DefinicionInvalidaError(detalles);
    return definicion;
  }

  static reconstituir(props: DefinicionProps): DefinicionParametro {
    return new DefinicionParametro({ ...props });
  }

  get codigo(): string {
    return this.props.codigo;
  }

  get productoCodigo(): string {
    return this.props.productoCodigo;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  get tipo(): TipoParametro {
    return this.props.tipo;
  }

  get valorDefecto(): unknown {
    return this.props.valorDefecto;
  }

  get alcanceMaximo(): AlcanceParametro {
    return this.props.alcanceMaximo;
  }

  get esquema(): object | null {
    return this.props.esquema;
  }

  get obsoleto(): boolean {
    return this.props.obsoleto;
  }

  /** TR-RN-015: primero el tipo, luego el esquema si existe. */
  validarValor(valor: unknown, esquemas: ValidadorEsquema): void {
    if (!CUMPLE_TIPO[this.props.tipo](valor)) throw new ValorInvalidoError(`Se esperaba un valor ${this.props.tipo}`);
    if (this.props.esquema === null) return;
    const error = esquemas.validar(this.props.esquema, valor);
    if (error !== null) throw new ValorInvalidoError(error);
  }

  /** TR-RN-014: no se admite un valor en un alcance más específico que el máximo. */
  admite(alcance: AlcanceParametro): void {
    if (RANGO_ALCANCE[alcance] < RANGO_ALCANCE[this.props.alcanceMaximo]) throw new AlcanceNoPermitidoError(this.props.alcanceMaximo);
  }

  /** Campos que el manifiesto puede cambiar en una definición existente. */
  difiereDe(otra: DefinicionParametro): boolean {
    return (
      this.props.descripcion !== otra.props.descripcion ||
      this.props.alcanceMaximo !== otra.props.alcanceMaximo ||
      !igualJson(this.props.valorDefecto, otra.props.valorDefecto) ||
      !igualJson(this.props.esquema, otra.props.esquema)
    );
  }
}
