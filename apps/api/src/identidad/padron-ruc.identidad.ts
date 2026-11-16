import { CuotaAgotadaError, DocumentoNoEncontradoError, ProveedorNoDisponibleError, type IdentidadPort } from '@vitrina/plataforma/identidad';
import type { DatosPadron, PadronRucPort } from '@vitrina/plataforma/org';

const MOTIVO_REGISTRO_EMPRESA = 'VERIFICACION_IDENTIDAD';
const PRODUCTO_PLATAFORMA = 'PLAT';

/** Spec 28b: ORG consulta el padrón por IDN; vive aquí porque org e identidad no se importan (PL-10). */
export class PadronRucIdentidad implements PadronRucPort {
  constructor(private readonly identidad: IdentidadPort) {}

  async consultar(ruc: string): Promise<DatosPadron | null> {
    try {
      const respuesta = await this.identidad.consultar({ tipo: 'RUC', numero: ruc, motivo: MOTIVO_REGISTRO_EMPRESA, productoCodigo: PRODUCTO_PLATAFORMA });
      if (respuesta.tipo !== 'RUC') return null;
      const { razonSocial, estado, condicion } = respuesta.datos;
      return { razonSocial, estado, condicion };
    } catch (error) {
      if (esPadronSinDatos(error)) return null;
      throw error;
    }
  }
}

/** TR-RNF-007: sin padrón (no existe, proveedor caído o cuota agotada), la razón social sale del comando. */
function esPadronSinDatos(error: unknown): boolean {
  return error instanceof DocumentoNoEncontradoError || error instanceof ProveedorNoDisponibleError || error instanceof CuotaAgotadaError;
}
