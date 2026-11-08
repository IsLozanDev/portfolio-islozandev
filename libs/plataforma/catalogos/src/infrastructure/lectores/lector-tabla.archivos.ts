import type { LectorTabla, TablaLeida, TipoArchivo } from '../../application/ports/importacion.js';
import { LectorCsv } from './lector-csv.js';
import { LectorXlsx } from './lector-xlsx.js';

export class LectorTablaArchivos implements LectorTabla {
  private readonly csv = new LectorCsv();
  private readonly xlsx = new LectorXlsx();

  leer(archivo: Buffer, tipo: TipoArchivo): Promise<TablaLeida> {
    return tipo === 'CSV' ? this.csv.leer(archivo) : this.xlsx.leer(archivo);
  }
}
