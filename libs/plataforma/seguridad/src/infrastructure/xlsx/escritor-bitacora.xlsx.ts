import ExcelJS from 'exceljs';
import type { EscritorBitacora } from '../../application/ports/escritor-bitacora.port.js';
import type { EventoBitacoraExportado } from '../../application/ports/lectura-bitacora.js';
import { ETIQUETAS_BITACORA } from './etiquetas-bitacora.js';

const ZONA_LIMA = 'America/Lima';
const FILA_ENCABEZADO = 1;
const RANGO_FILTRO = 'A1:F1';
const ANCHOS = { fecha: 20, tipo: 22, usuario: 28, correo: 34, resumen: 48, ip: 18 } as const;

const PARTES_FECHA = new Intl.DateTimeFormat('es-PE', {
  timeZone: ZONA_LIMA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** «04/11/2026 10:00:00» en America/Lima; como texto, así Excel no lo corre a la zona del equipo. */
export function fechaLima(instante: Date): string {
  const partes = PARTES_FECHA.formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((candidata) => candidata.type === tipo)?.value ?? '';
  return `${parte('day')}/${parte('month')}/${parte('year')} ${parte('hour')}:${parte('minute')}:${parte('second')}`;
}

/** Método de LOGIN o motivo de LOGIN_FALLIDO con su etiqueta; el resto del resumen tal cual. */
export function resumenLegible(evento: EventoBitacoraExportado): string {
  const resumen = evento.resumen ?? '';
  if (evento.tipo === 'LOGIN') return ETIQUETAS_BITACORA.metodos[resumen] ?? resumen;
  if (evento.tipo === 'LOGIN_FALLIDO') return (ETIQUETAS_BITACORA.motivos as Readonly<Record<string, string>>)[resumen] ?? resumen;
  return resumen;
}

/**
 * Hoja «Bitácora» en streaming con exceljs: cada fila se confirma al escribirse y no queda en memoria.
 * Sin el JSON del detalle (spec 18b). El libro se crea en `abrir`: su constructor ya escribe en el destino.
 */
export class EscritorBitacoraXlsx implements EscritorBitacora {
  private libro: ExcelJS.stream.xlsx.WorkbookWriter | null = null;
  private hoja: ExcelJS.Worksheet | null = null;

  constructor(private readonly destino: NodeJS.WritableStream) {}

  abrir(): void {
    this.libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: this.destino as never, useStyles: true, useSharedStrings: false });
    const columnas = ETIQUETAS_BITACORA.columnas;
    this.hoja = this.libro.addWorksheet(ETIQUETAS_BITACORA.hoja, { views: [{ state: 'frozen', ySplit: FILA_ENCABEZADO }] });
    this.hoja.columns = (Object.keys(ANCHOS) as (keyof typeof ANCHOS)[]).map((clave) => ({ header: columnas[clave], key: clave, width: ANCHOS[clave] }));
    this.hoja.autoFilter = RANGO_FILTRO;
    const encabezado = this.hoja.getRow(FILA_ENCABEZADO);
    encabezado.font = { bold: true };
    encabezado.commit();
  }

  async escribir(eventos: readonly EventoBitacoraExportado[]): Promise<void> {
    const hoja = this.hojaAbierta();
    for (const evento of eventos) {
      hoja
        .addRow({
          fecha: fechaLima(evento.ocurridoEn),
          tipo: ETIQUETAS_BITACORA.tipos[evento.tipo],
          usuario: evento.usuario?.nombre ?? '',
          correo: evento.usuario?.correo ?? '',
          resumen: resumenLegible(evento),
          ip: evento.ip ?? '',
        })
        .commit();
    }
  }

  async terminar(): Promise<void> {
    this.hojaAbierta().commit();
    await this.libro?.commit();
  }

  private hojaAbierta(): ExcelJS.Worksheet {
    if (!this.hoja) throw new Error('EscritorBitacoraXlsx: abrir() antes de escribir');
    return this.hoja;
  }
}
