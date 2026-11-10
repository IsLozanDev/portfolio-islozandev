import ExcelJS from 'exceljs';
import type { EscritorAuditoria, EventoAuditoriaExportado } from '../../application/ports/escritor-auditoria.port.js';
import { ETIQUETAS_AUDITORIA } from './etiquetas-auditoria.js';

const ZONA_LIMA = 'America/Lima';
const FILA_ENCABEZADO = 1;
const ANCHOS = {
  fecha: 20,
  tipo: 16,
  accion: 28,
  entidad: 18,
  id: 24,
  usuario: 28,
  correo: 34,
  sucursal: 28,
  motivo: 40,
  finalidad: 18,
  ticket: 14,
  campos: 48,
  ip: 18,
  numero: 10,
} as const;
const COLUMNAS = Object.keys(ANCHOS) as (keyof typeof ANCHOS)[];
const SEPARADOR_SUCURSAL = ' · ';

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

/** «A1:N1»: el filtro automático cubre todas las columnas del encabezado. */
function rangoDelEncabezado(): string {
  const ultimaColumna = String.fromCharCode('A'.charCodeAt(0) + COLUMNAS.length - 1);
  return `A${FILA_ENCABEZADO}:${ultimaColumna}${FILA_ENCABEZADO}`;
}

/**
 * Hoja «Auditoría» en streaming con exceljs: cada fila se confirma al escribirse y no queda en memoria.
 * Sin el JSON de antes ni despues (spec 20b). El libro se crea en `abrir`: su constructor ya escribe en el destino.
 */
export class EscritorAuditoriaXlsx implements EscritorAuditoria {
  private libro: ExcelJS.stream.xlsx.WorkbookWriter | null = null;
  private hoja: ExcelJS.Worksheet | null = null;

  constructor(private readonly destino: NodeJS.WritableStream) {}

  abrir(): void {
    this.libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: this.destino as never, useStyles: true, useSharedStrings: false });
    const titulos = ETIQUETAS_AUDITORIA.columnas;
    this.hoja = this.libro.addWorksheet(ETIQUETAS_AUDITORIA.hoja, { views: [{ state: 'frozen', ySplit: FILA_ENCABEZADO }] });
    this.hoja.columns = COLUMNAS.map((clave) => ({ header: titulos[clave], key: clave, width: ANCHOS[clave] }));
    this.hoja.autoFilter = rangoDelEncabezado();
    const encabezado = this.hoja.getRow(FILA_ENCABEZADO);
    encabezado.font = { bold: true };
    encabezado.commit();
  }

  async escribir(eventos: readonly EventoAuditoriaExportado[]): Promise<void> {
    const hoja = this.hojaAbierta();
    for (const evento of eventos) {
      hoja
        .addRow({
          fecha: fechaLima(evento.ocurridoEn),
          tipo: ETIQUETAS_AUDITORIA.tipos[evento.tipo],
          accion: evento.accion,
          entidad: evento.entidadTipo,
          id: evento.entidadId,
          usuario: evento.usuario?.nombre ?? '',
          correo: evento.usuario?.correo ?? '',
          sucursal: evento.sucursal ? `${evento.sucursal.codigo}${SEPARADOR_SUCURSAL}${evento.sucursal.nombre}` : '',
          motivo: evento.motivo ?? '',
          finalidad: evento.finalidad ?? '',
          ticket: evento.ticket ?? '',
          campos: evento.camposCambiados,
          ip: evento.ip ?? '',
          numero: Number(evento.numero),
        })
        .commit();
    }
  }

  async terminar(): Promise<void> {
    this.hojaAbierta().commit();
    await this.libro?.commit();
  }

  private hojaAbierta(): ExcelJS.Worksheet {
    if (!this.hoja) throw new Error('EscritorAuditoriaXlsx: abrir() antes de escribir');
    return this.hoja;
  }
}
