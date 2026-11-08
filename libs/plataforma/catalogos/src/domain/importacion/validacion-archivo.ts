import type { DisenoTabla } from './disenos-tablas.js';
import type { FilaImportada } from './fila-importada.js';
import { ERRORES_MAXIMOS_GUARDADOS, type ErrorFila } from './tipos.js';
import { validarFila } from './validar-fila.js';

/**
 * Acumula la validación de todas las filas del archivo, sin detenerse en el primer error. Guarda hasta
 * ERRORES_MAXIMOS_GUARDADOS errores y cuenta el total real.
 */
export class ValidacionArchivo {
  private readonly filasValidas: FilaImportada[] = [];
  private readonly erroresGuardados: ErrorFila[] = [];
  private readonly filaPorCodigo = new Map<string, number>();
  private total = 0;

  constructor(private readonly diseno: DisenoTabla) {}

  agregar(numero: number, celdas: Readonly<Record<string, string>>): void {
    const resultado = validarFila(this.diseno, numero, celdas);
    if (!resultado.valida) {
      resultado.errores.forEach((error) => this.registrarError(error));
      return;
    }
    const { fila } = resultado;
    const filaAnterior = this.filaPorCodigo.get(fila.codigo);
    if (filaAnterior !== undefined) {
      this.registrarError({ fila: numero, columna: 'codigo', valor: fila.codigo, mensaje: `Código repetido; ya está en la fila ${filaAnterior}` });
      return;
    }
    this.filaPorCodigo.set(fila.codigo, numero);
    this.filasValidas.push(fila);
  }

  get tieneErrores(): boolean {
    return this.total > 0;
  }

  get totalErrores(): number {
    return this.total;
  }

  get errores(): readonly ErrorFila[] {
    return this.erroresGuardados;
  }

  get filas(): readonly FilaImportada[] {
    return this.filasValidas;
  }

  private registrarError(error: ErrorFila): void {
    this.total += 1;
    if (this.erroresGuardados.length < ERRORES_MAXIMOS_GUARDADOS) this.erroresGuardados.push(error);
  }
}
