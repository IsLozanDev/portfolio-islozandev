import type { HasherDocumento } from '@vitrina/plataforma/identidad';
import { hashDocumento } from '@vitrina/plataforma/observabilidad';

/** TR-RNF-111: el mismo hash que los logs, con la sal de plataforma; idn no importa observabilidad (PL-10). */
export class HasherDocumentoObservabilidad implements HasherDocumento {
  constructor(private readonly sal: string) {}

  hashear(numero: string): string {
    return hashDocumento(numero, this.sal);
  }
}
