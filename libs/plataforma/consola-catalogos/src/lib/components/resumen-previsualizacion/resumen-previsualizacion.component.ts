import { Component, computed, input } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { formatearFechaCalendario } from '@vitrina/plataforma/catalogos-ui';
import { TablaComponent, type ColumnaTabla } from '@vitrina/shared/ui';
import type { CambioEnMuestra, Previsualizacion } from '../../models/importacion';
import { CAMPOS_COMPARADOS, MENSAJES_RESUMEN } from '../../models/mensajes-catalogos';

interface FilaAlta {
  codigo: string;
  nombre: string;
}

/** Un campo que difiere en un cambio: una fila por campo. */
interface FilaCambio {
  codigo: string;
  campo: string;
  antes: string;
  despues: string;
}

interface FilaBaja {
  codigo: string;
  nombre: string;
  vigenteHasta: string;
}

interface Contador {
  etiqueta: string;
  valor: number;
  destacado: boolean;
}

type CampoComparado = keyof typeof CAMPOS_COMPARADOS;

const COLUMNAS_ALTAS: ColumnaTabla<FilaAlta>[] = [
  { clave: 'codigo', titulo: MENSAJES_RESUMEN.codigo, movil: 'detalle' },
  { clave: 'nombre', titulo: MENSAJES_RESUMEN.nombre, movil: 'titulo' },
];
const COLUMNAS_CAMBIOS: ColumnaTabla<FilaCambio>[] = [
  { clave: 'codigo', titulo: MENSAJES_RESUMEN.codigo, movil: 'titulo' },
  { clave: 'campo', titulo: MENSAJES_RESUMEN.campo, movil: 'detalle' },
  { clave: 'antes', titulo: MENSAJES_RESUMEN.antes, movil: 'detalle' },
  { clave: 'despues', titulo: MENSAJES_RESUMEN.despues, movil: 'detalle' },
];
const COLUMNAS_BAJAS: ColumnaTabla<FilaBaja>[] = [
  { clave: 'codigo', titulo: MENSAJES_RESUMEN.codigo, movil: 'detalle' },
  { clave: 'nombre', titulo: MENSAJES_RESUMEN.nombre, movil: 'titulo' },
  { clave: 'vigenteHasta', titulo: MENSAJES_RESUMEN.vigenteHasta, movil: 'detalle' },
];
/** La API trae hasta 20 por tipo: una sola página. */
const TAMANO_MUESTRA = 20;

/** TR-CA-072: contadores de la previsualización y la muestra de cada tipo; en los cambios, solo los campos que difieren. */
@Component({
  selector: 'vit-resumen-previsualizacion',
  imports: [MatTabsModule, TablaComponent],
  templateUrl: './resumen-previsualizacion.component.html',
})
export class ResumenPrevisualizacionComponent {
  readonly previsualizacion = input.required<Previsualizacion>();

  protected readonly mensajes = MENSAJES_RESUMEN;
  protected readonly columnasAltas = COLUMNAS_ALTAS;
  protected readonly columnasCambios = COLUMNAS_CAMBIOS;
  protected readonly columnasBajas = COLUMNAS_BAJAS;
  protected readonly tamanoMuestra = TAMANO_MUESTRA;

  protected readonly contadores = computed<Contador[]>(() => {
    const { resumen } = this.previsualizacion();
    return [
      { etiqueta: MENSAJES_RESUMEN.altas, valor: resumen.altas, destacado: false },
      { etiqueta: MENSAJES_RESUMEN.cambios, valor: resumen.cambios, destacado: false },
      { etiqueta: MENSAJES_RESUMEN.bajas, valor: resumen.bajas, destacado: resumen.bajas > 0 },
      { etiqueta: MENSAJES_RESUMEN.sinCambios, valor: resumen.sinCambios, destacado: false },
      { etiqueta: MENSAJES_RESUMEN.totalFilas, valor: resumen.totalFilas, destacado: false },
    ];
  });
  protected readonly altas = computed<FilaAlta[]>(() => this.previsualizacion().muestra.altas.map(({ codigo, nombre }) => ({ codigo, nombre })));
  protected readonly cambios = computed<FilaCambio[]>(() => this.previsualizacion().muestra.cambios.flatMap(filasDelCambio));
  protected readonly bajas = computed<FilaBaja[]>(() =>
    this.previsualizacion().muestra.bajas.map((baja) => ({ codigo: baja.codigo, nombre: baja.nombre, vigenteHasta: formatearFechaCalendario(baja.vigenteHasta) })),
  );
}

function filasDelCambio({ antes, despues }: CambioEnMuestra): FilaCambio[] {
  const valores: Record<CampoComparado, [unknown, unknown]> = {
    codigoExterno: [antes.codigoExterno, despues.codigoExterno],
    nombre: [antes.nombre, despues.nombre],
    abreviatura: [antes.abreviatura, despues.abreviatura],
    orden: [antes.orden, despues.orden],
    atributos: [antes.atributos, despues.atributos],
  };
  return (Object.keys(valores) as CampoComparado[])
    .map((campo) => ({ campo, antes: comoTexto(valores[campo][0]), despues: comoTexto(valores[campo][1]) }))
    .filter((comparacion) => comparacion.antes !== comparacion.despues)
    .map((comparacion) => ({ codigo: despues.codigo, campo: CAMPOS_COMPARADOS[comparacion.campo], antes: comparacion.antes, despues: comparacion.despues }));
}

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return MENSAJES_RESUMEN.sinValor;
  return typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
}
