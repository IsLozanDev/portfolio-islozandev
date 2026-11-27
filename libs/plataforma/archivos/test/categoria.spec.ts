import { readFileSync } from 'node:fs';
import { CODIGOS_CATEGORIA } from '../src/domain/categoria.js';
import { categoriaDocumento, categoriaImagen, DIEZ_MEGABYTES, MIME_DOCX, VEINTICINCO_MEGABYTES } from './support/categorias.js';

const MIGRACIONES_CON_CATEGORIAS = ['01m_arc.sql', '01y_org_identidad_empresa.sql'].map(
  (archivo) => new URL(`../../../../db/${archivo}`, import.meta.url),
);

describe('CategoriaArchivo', () => {
  it('admite solo los MIME de su lista', () => {
    const documento = categoriaDocumento();

    expect(documento.admiteMime('application/pdf')).toBe(true);
    expect(documento.admiteMime(MIME_DOCX)).toBe(true);
    expect(documento.admiteMime('image/png')).toBe(false);
    expect(documento.admiteMime('application/x-msdownload')).toBe(false);
  });

  it('admite desde 1 byte hasta su máximo', () => {
    expect(categoriaImagen().admiteTamano(1)).toBe(true);
    expect(categoriaImagen().admiteTamano(DIEZ_MEGABYTES)).toBe(true);
    expect(categoriaImagen().admiteTamano(DIEZ_MEGABYTES + 1)).toBe(false);
    expect(categoriaDocumento().admiteTamano(VEINTICINCO_MEGABYTES)).toBe(true);
    expect(categoriaDocumento().admiteTamano(VEINTICINCO_MEGABYTES + 1)).toBe(false);
  });

  it('no admite cero, negativos ni decimales', () => {
    expect(categoriaImagen().admiteTamano(0)).toBe(false);
    expect(categoriaImagen().admiteTamano(-5)).toBe(false);
    expect(categoriaImagen().admiteTamano(10.5)).toBe(false);
  });
});

describe('CODIGOS_CATEGORIA', () => {
  it('son los mismos códigos que siembran 01m_arc.sql y 01y_org_identidad_empresa.sql', () => {
    const migraciones = MIGRACIONES_CON_CATEGORIAS.map((migracion) => readFileSync(migracion, 'utf8')).join('\n');
    const sembrados = [...migraciones.matchAll(/\('([A-Z_]+)', ARRAY\[/g)].map((fila) => fila[1]);

    expect(sembrados.sort()).toEqual([...CODIGOS_CATEGORIA].sort());
  });
});
