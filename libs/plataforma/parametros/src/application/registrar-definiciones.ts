import { DefinicionParametro } from '../domain/definicion-parametro.js';
import { DefinicionInvalidaError } from '../domain/errores.js';
import type { ValidadorEsquema } from '../domain/validador-esquema.js';
import type { CambiosDefiniciones, RepositorioDefiniciones, ResumenDefiniciones } from './ports/repositorios.js';

/** Bloque `parametros` del manifiesto; `producto_codigo` sale de la raíz. */
export interface EntradaDefiniciones {
  productoCodigo: string;
  parametros: unknown;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** TR-RF-030: registra las definiciones declaradas en el manifiesto de un producto. Idempotente (TR-RNF-120). */
export class RegistrarDefiniciones {
  constructor(
    private readonly repositorio: RepositorioDefiniciones,
    private readonly esquemas: ValidadorEsquema,
  ) {}

  /** Sin base: el CLI lo llama antes de aplicar el manifiesto de seg (TR-CA-079). */
  validar(entrada: EntradaDefiniciones): DefinicionParametro[] {
    if (!Array.isArray(entrada.parametros)) throw new DefinicionInvalidaError(['parametros: debe ser un arreglo']);
    const detalles: string[] = [];
    const definiciones: DefinicionParametro[] = [];
    const vistos = new Set<string>();

    entrada.parametros.forEach((p: unknown, i) => {
      if (!esObjeto(p)) {
        detalles.push(`parametros[${i}]: debe ser un objeto`);
        return;
      }
      const codigo = texto(p.codigo);
      if (vistos.has(codigo)) detalles.push(`parametros[${i}].codigo: duplicado ${codigo}`);
      vistos.add(codigo);
      try {
        definiciones.push(
          DefinicionParametro.crear(
            {
              codigo,
              productoCodigo: entrada.productoCodigo,
              descripcion: texto(p.descripcion),
              tipo: p.tipo as DefinicionParametro['tipo'],
              valorDefecto: p.valor_defecto,
              alcanceMaximo: p.alcance_maximo as DefinicionParametro['alcanceMaximo'],
              esquema: (p.esquema ?? null) as object | null,
            },
            this.esquemas,
          ),
        );
      } catch (error) {
        if (!(error instanceof DefinicionInvalidaError)) throw error;
        detalles.push(...error.detalles.map((d) => `parametros[${i}].${d}`));
      }
    });

    if (detalles.length > 0) throw new DefinicionInvalidaError(detalles);
    return definiciones;
  }

  async ejecutar(entrada: EntradaDefiniciones): Promise<ResumenDefiniciones> {
    const nuevas = this.validar(entrada);

    return this.repositorio.transaccion(async (sesion) => {
      const actuales = new Map((await sesion.todasDe(entrada.productoCodigo)).map((d) => [d.codigo, d]));
      const cambios: CambiosDefiniciones = { insertar: [], actualizar: [], reactivar: [], obsoletar: [] };
      const detalles: string[] = [];

      nuevas.forEach((nueva, i) => {
        const actual = actuales.get(nueva.codigo);
        if (!actual) cambios.insertar.push(nueva);
        // Los valores guardados dejarían de cumplir el tipo: un cambio de tipo es un parámetro nuevo.
        else if (actual.tipo !== nueva.tipo) detalles.push(`parametros[${i}].tipo: ${nueva.codigo} es ${actual.tipo} y no puede cambiar a ${nueva.tipo}`);
        else if (actual.obsoleto) cambios.reactivar.push(nueva);
        else if (actual.difiereDe(nueva)) cambios.actualizar.push(nueva);
      });
      const declaradas = new Set(nuevas.map((d) => d.codigo));
      for (const actual of actuales.values()) if (!actual.obsoleto && !declaradas.has(actual.codigo)) cambios.obsoletar.push(actual.codigo);

      if (detalles.length > 0) throw new DefinicionInvalidaError(detalles);

      const resumen: ResumenDefiniciones = {
        insertadas: cambios.insertar.length,
        actualizadas: cambios.actualizar.length,
        obsoletas: cambios.obsoletar.length,
        reactivadas: cambios.reactivar.length,
      };
      if (Object.values(resumen).some((n) => n > 0)) await sesion.aplicar(entrada.productoCodigo, cambios, resumen);
      return resumen;
    });
  }
}
