import sanitizeHtml, { type IOptions } from 'sanitize-html';
import type { SaneadorHtml } from '../../application/ports/saneador-html.js';

// TR-RNF-012: lista blanca para el cuerpo de un correo. Sin script, iframe, img, eventos on* ni javascript:.
// Un `{{variable}}` en texto o en href pasa tal cual: sanitize-html no codifica las llaves y un href sin
// esquema es relativo (lo cubre la prueba del saneador).

const ETIQUETAS_PERMITIDAS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'span', 'div', 'hr',
];
const ATRIBUTO_ESTILO = 'style';
/** Celdas y bloques: donde un cliente de correo respeta el estilo en línea. */
const ETIQUETAS_CON_ESTILO = ['p', 'div', 'h1', 'h2', 'h3', 'table', 'td', 'th'];
const ESQUEMAS_PERMITIDOS = ['https', 'mailto'];
const ATRIBUTOS_CON_ESQUEMA = ['href'];

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i, /^[a-z]+$/i];
const MEDIDA = [/^\d+(\.\d+)?(px|em|rem|%)$/];
/** Solo propiedades de texto y color: nada que posicione, cargue URLs o cambie el layout. */
const ESTILOS_DE_TEXTO: IOptions['allowedStyles'] = {
  '*': {
    color: COLOR,
    'background-color': COLOR,
    'text-align': [/^(left|right|center|justify)$/],
    'font-weight': [/^(normal|bold|[1-9]00)$/],
    'font-style': [/^(normal|italic)$/],
    'font-size': MEDIDA,
    'line-height': [/^\d+(\.\d+)?$/, ...MEDIDA],
    'text-decoration': [/^(none|underline|line-through)$/],
  },
};

const OPCIONES: IOptions = {
  allowedTags: ETIQUETAS_PERMITIDAS,
  allowedAttributes: {
    a: ['href'],
    ...Object.fromEntries(ETIQUETAS_CON_ESTILO.map((etiqueta) => [etiqueta, [ATRIBUTO_ESTILO]])),
  },
  allowedSchemes: ESQUEMAS_PERMITIDOS,
  allowedSchemesByTag: {},
  allowedSchemesAppliedToAttributes: ATRIBUTOS_CON_ESQUEMA,
  allowProtocolRelative: false,
  allowedStyles: ESTILOS_DE_TEXTO,
  disallowedTagsMode: 'discard',
};

export class SaneadorHtmlSanitize implements SaneadorHtml {
  sanear(html: string): string {
    return sanitizeHtml(html, OPCIONES);
  }
}
