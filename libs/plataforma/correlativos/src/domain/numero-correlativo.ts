/** Número emitido de una serie, con relleno de ceros a los dígitos de la serie: B002-00000125, A-001. */
export class NumeroCorrelativo {
  private constructor(
    readonly serie: string,
    readonly numero: bigint,
    private readonly digitos: number,
  ) {}

  static de(serie: string, numero: bigint, digitos: number): NumeroCorrelativo {
    return new NumeroCorrelativo(serie, numero, digitos);
  }

  get formateado(): string {
    return `${this.serie}-${this.numero.toString().padStart(this.digitos, '0')}`;
  }
}
