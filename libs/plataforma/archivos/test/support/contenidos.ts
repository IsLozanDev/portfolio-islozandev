import { crc32 } from 'node:zlib';

// Contenidos mínimos con los bytes mágicos reales de cada formato, armados en memoria: el repo no guarda binarios.

const CODIFICADOR = new TextEncoder();
const FIRMA_CABECERA_LOCAL = 0x04034b50;
const FIRMA_DIRECTORIO_CENTRAL = 0x02014b50;
const FIRMA_FIN_DIRECTORIO = 0x06054b50;
const VERSION_ZIP = 20;

export const texto = (contenido: string): Uint8Array => CODIFICADOR.encode(contenido);

export const pdf = (): Uint8Array => texto('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

export const jpeg = (): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

export const png = (): Uint8Array =>
  Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

export const webp = (): Uint8Array =>
  Uint8Array.from([...texto('RIFF'), 0x1a, 0x00, 0x00, 0x00, ...texto('WEBPVP8 '), 0x0e, 0x00, 0x00, 0x00, ...new Array<number>(14).fill(0x01)]);

/** Cabecera `MZ` de un ejecutable de Windows. */
export const ejecutable = (): Uint8Array =>
  Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, ...new Array<number>(48).fill(0x00)]);

export const zip = (): Uint8Array => armarZip([{ nombre: 'factura.xml', contenido: texto('<Invoice/>') }]);

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export const docx = (): Uint8Array =>
  armarZip([
    {
      nombre: '[Content_Types].xml',
      contenido: texto(
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="${TIPO_DOCX}"/></Types>`,
      ),
    },
    { nombre: 'word/document.xml', contenido: texto('<w:document/>') },
  ]);

interface EntradaZip {
  nombre: string;
  contenido: Uint8Array;
}

/** ZIP sin compresión: cabeceras locales, directorio central y fin de directorio. */
function armarZip(entradas: EntradaZip[]): Uint8Array {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const entrada of entradas) {
    const nombre = Buffer.from(entrada.nombre, 'utf8');
    const comunes = cabeceraComun(entrada.contenido, nombre.length);
    const local = Buffer.concat([entero32(FIRMA_CABECERA_LOCAL), entero16(VERSION_ZIP), comunes, nombre, entrada.contenido]);
    const central = Buffer.concat([
      entero32(FIRMA_DIRECTORIO_CENTRAL),
      entero16(VERSION_ZIP),
      entero16(VERSION_ZIP),
      comunes,
      Buffer.alloc(8),
      entero32(0),
      entero32(desplazamiento),
      nombre,
    ]);
    locales.push(local);
    centrales.push(central);
    desplazamiento += local.length;
  }
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.concat([
    entero32(FIRMA_FIN_DIRECTORIO),
    Buffer.alloc(4),
    entero16(entradas.length),
    entero16(entradas.length),
    entero32(directorio.length),
    entero32(desplazamiento),
    entero16(0),
  ]);
  return new Uint8Array(Buffer.concat([...locales, directorio, fin]));
}

/** Banderas, método, hora, fecha, CRC, tamaños y largo del nombre: iguales en la cabecera local y en la central. */
function cabeceraComun(contenido: Uint8Array, largoNombre: number): Buffer {
  return Buffer.concat([
    Buffer.alloc(8),
    entero32(crc32(contenido)),
    entero32(contenido.length),
    entero32(contenido.length),
    entero16(largoNombre),
    entero16(0),
  ]);
}

function entero16(valor: number): Buffer {
  const destino = Buffer.alloc(2);
  destino.writeUInt16LE(valor);
  return destino;
}

function entero32(valor: number): Buffer {
  const destino = Buffer.alloc(4);
  destino.writeUInt32LE(valor >>> 0);
  return destino;
}
