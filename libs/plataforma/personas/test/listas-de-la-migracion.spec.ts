import { readFile } from 'node:fs/promises';
import { PRODUCTOS } from '@vitrina/plataforma/org';
import { TIPOS_CONTACTO } from '../src/domain/contacto.js';
import { TIPOS_DOCUMENTO_PERSONA } from '../src/domain/documento-identidad.js';
import { TIPOS_PERSONA } from '../src/domain/persona.js';
import { ROLES_PERSONA } from '../src/domain/rol-persona.js';

const MIGRACION = new URL('../../../../db/01l_per.sql', import.meta.url);

/** Valores del `CHECK (columna IN (...))` de la migración. */
async function valoresDelCheck(columna: string): Promise<string[]> {
  const sql = await readFile(MIGRACION, 'utf8');
  const lista = new RegExp(`CHECK \\(${columna} IN \\(([^)]*)\\)\\)`).exec(sql)?.[1] ?? '';
  return lista.split(',').map((valor) => valor.trim().replaceAll("'", ''));
}

// Agregar un producto, un rol o un tipo obliga a una migración: el CHECK y el código deben decir lo mismo.
describe('listas de 01l_per.sql', () => {
  it.each<[string, readonly string[]]>([
    ['producto_codigo', PRODUCTOS],
    ['rol', ROLES_PERSONA],
    ['tipo_persona', TIPOS_PERSONA],
    ['tipo_documento', TIPOS_DOCUMENTO_PERSONA],
    ['tipo_contacto', TIPOS_CONTACTO],
  ])('el CHECK de %s coincide con el código', async (columna, esperados) => {
    expect(await valoresDelCheck(columna)).toEqual([...esperados]);
  });
});
