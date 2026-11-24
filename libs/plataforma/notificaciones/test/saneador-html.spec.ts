import { SaneadorHtmlSanitize } from '../src/infrastructure/sanitize-html/saneador-html.sanitize.js';

describe('saneador HTML del cuerpo (TR-RNF-012)', () => {
  const saneador = new SaneadorHtmlSanitize();

  it('quita <script> con su contenido, iframe e img', () => {
    expect(saneador.sanear('<p>Hola</p><script>alert(1)</script><iframe src="https://x.pe"></iframe><img src="https://x.pe/a.png">')).toBe(
      '<p>Hola</p>',
    );
  });

  it('quita los eventos on* y deja la etiqueta', () => {
    expect(saneador.sanear('<p onclick="robar()" onmouseover="x()">Hola</p>')).toBe('<p>Hola</p>');
  });

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://inseguro.pe', '//otro.pe/x'])(
    'quita el href %s',
    (href) => {
      expect(saneador.sanear(`<a href="${href}">enlace</a>`)).toBe('<a>enlace</a>');
    },
  );

  it('conserva href https y mailto', () => {
    const html = '<a href="https://vitrina.pe/ayuda">ayuda</a> <a href="mailto:soporte@vitrina.pe">correo</a>';

    expect(saneador.sanear(html)).toBe(html);
  });

  it('{{nombre}} en el texto y {{enlace}} en href sobreviven al saneo, con o sin espacios', () => {
    const html = '<p>Hola {{nombre}}:</p><a href="{{enlace}}">entra</a> <a href="https://vitrina.pe/?t={{ token }}">aquí</a>';

    expect(saneador.sanear(html)).toBe(html);
  });

  it('conserva una tabla con estilos simples de texto y color', () => {
    const html =
      '<table style="background-color:#f5f5f5"><thead><tr><th style="text-align:left;font-weight:bold">Producto</th></tr></thead>' +
      '<tbody><tr><td style="color:#1b5e20;font-size:14px">SazónPOS</td></tr></tbody></table>';

    expect(saneador.sanear(html)).toBe(html);
  });

  it('quita estilos que posicionan o cargan URLs y el style fuera de celdas y bloques', () => {
    expect(saneador.sanear('<td style="color:red;position:fixed;background:url(https://x.pe/t.gif)">c</td>')).toBe('<td style="color:red">c</td>');
    expect(saneador.sanear('<span style="color:red">s</span>')).toBe('<span>s</span>');
  });

  it('deja las etiquetas de formato de la lista blanca y descarta el resto sin perder el texto', () => {
    expect(saneador.sanear('<h1>T</h1><ul><li><strong>a</strong> <em>b</em> <u>c</u></li></ul><hr /><form><input>texto</form>')).toBe(
      '<h1>T</h1><ul><li><strong>a</strong> <em>b</em> <u>c</u></li></ul><hr />texto',
    );
  });
});
