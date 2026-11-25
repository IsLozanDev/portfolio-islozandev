import type { PadronRucPort } from '@vitrina/plataforma/org';
import type { PadronAdquirente } from '../../application/ports/reglas-emision.js';
import type { SituacionContribuyente } from '../../domain/comprobante/reglas-factura.js';

/** Sobre `PADRON_RUC` de ORG (con caché en IDN). Un padrón caído no impide emitir (TR-RNF-007): sin advertencia. */
export class PadronAdquirenteOrg implements PadronAdquirente {
  constructor(
    private readonly padron: PadronRucPort,
    private readonly avisar: (mensaje: string, datos: Record<string, unknown>) => void,
  ) {}

  async situacion(ruc: string): Promise<SituacionContribuyente | null> {
    try {
      const datos = await this.padron.consultar(ruc);
      return datos && { estado: datos.estado, condicion: datos.condicion };
    } catch (error) {
      // Sin el RUC: es dato del adquirente (TR-RNF-026).
      this.avisar('fe.padron.no_disponible', { error: error instanceof Error ? error.name : 'desconocido' });
      return null;
    }
  }
}
