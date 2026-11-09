import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

/** `dd/MM/yyyy`, también con un dígito en día o mes. */
const FECHA_PERU = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * El adaptador nativo lee el texto con `Date.parse`, que toma `27/10/2026` como inválido.
 * Se lee `dd/MM/yyyy` (es-PE) y se valida que el día exista; el formato de salida sigue siendo el nativo.
 */
@Injectable()
export class AdaptadorFechaPeru extends NativeDateAdapter {
  override parse(valor: unknown, formato?: object): Date | null {
    if (typeof valor !== 'string') return super.parse(valor, formato);
    const texto = valor.trim();
    if (texto === '') return null;
    const partes = FECHA_PERU.exec(texto);
    if (!partes) return this.invalid();
    const [, dia, mes, anio] = partes.map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    const existe = fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
    return existe ? fecha : this.invalid();
  }
}
