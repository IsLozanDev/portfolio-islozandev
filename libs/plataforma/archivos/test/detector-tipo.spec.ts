import { DetectorTipoFileType } from '../src/infrastructure/tipo/detector-tipo.file-type.js';
import { MIME_DOCX } from './support/categorias.js';
import { docx, ejecutable, jpeg, pdf, png, texto, webp, zip } from './support/contenidos.js';

const MARCA_DE_ORDEN_UTF8 = [0xef, 0xbb, 0xbf];
const UTF8_INVALIDO = Uint8Array.from([0x48, 0x6f, 0xc3, 0x28]);
const BINARIO_SIN_FIRMA = Uint8Array.from([0x13, 0x00, 0x37, 0x00, 0x42, 0x99, 0x00, 0x01]);

describe('DetectorTipoFileType', () => {
  const detector = new DetectorTipoFileType();

  it.each([
    ['PDF', pdf(), 'application/pdf'],
    ['DOCX', docx(), MIME_DOCX],
    ['JPEG', jpeg(), 'image/jpeg'],
    ['PNG', png(), 'image/png'],
    ['WebP', webp(), 'image/webp'],
    ['ZIP', zip(), 'application/zip'],
  ])('reconoce %s por sus bytes', async (_formato, contenido, mimeEsperado) => {
    expect(await detector.detectar(contenido)).toBe(mimeEsperado);
  });

  it('un .exe renombrado a .pdf sigue siendo un ejecutable (TR-CA-200)', async () => {
    const mimeReal = await detector.detectar(ejecutable());

    expect(mimeReal).toBe('application/x-msdownload');
    expect(mimeReal).not.toBe('application/pdf');
  });

  it.each([
    ['con declaración', texto('<?xml version="1.0" encoding="UTF-8"?>\n<Invoice><ID>F001-1</ID></Invoice>')],
    ['sin declaración', texto('<Invoice><ID>F001-1</ID></Invoice>')],
    ['con espacios antes del marcado', texto('  \n<Invoice/>')],
    ['con marca de orden de bytes', Uint8Array.from([...MARCA_DE_ORDEN_UTF8, ...texto('<?xml version="1.0"?><Invoice/>')])],
  ])('trata como XML el texto que empieza con marcado, %s', async (_caso, contenido) => {
    expect(await detector.detectar(contenido)).toBe('application/xml');
  });

  it('trata como texto plano el UTF-8 que no empieza con marcado', async () => {
    expect(await detector.detectar(texto('Adjunto la captura del error.\nGracias, Ñandú.'))).toBe('text/plain');
    expect(await detector.detectar(Uint8Array.from([...MARCA_DE_ORDEN_UTF8, ...texto('hola')]))).toBe('text/plain');
  });

  it.each([
    ['un binario sin firma conocida', BINARIO_SIN_FIRMA],
    ['bytes que no son UTF-8 válido', UTF8_INVALIDO],
    ['un contenido vacío', new Uint8Array()],
  ])('no reconoce %s', async (_caso, contenido) => {
    expect(await detector.detectar(contenido)).toBeNull();
  });
});
