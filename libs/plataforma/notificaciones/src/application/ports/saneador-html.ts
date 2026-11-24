export interface SaneadorHtml {
  /** Quita etiquetas y atributos fuera de la lista blanca; conserva `{{variable}}` en texto y en href. */
  sanear(html: string): string;
}
