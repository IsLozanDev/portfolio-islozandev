import { readFile } from 'node:fs/promises';
import type { Plantilla, VariableDeclarada } from '../../src/domain/plantilla.js';

const RUTA_SEMILLA = new URL('../../../../../db/01s_not_avisos_plataforma.sql', import.meta.url);
/** Cada fila del INSERT: id, NULL, código, canal, idioma, versión, asunto, cuerpo y variables (sin comillas simples dentro). */
const FILA = /'(44000000-[0-9a-f-]+)', NULL, '([A-Z_]+)', 'CORREO', 'es', 1,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/g;
const CREADA = new Date('2026-11-24T00:00:00.000Z');

/** Las cuatro plantillas base tal como las siembra db/01s_not_avisos_plataforma.sql. */
export async function plantillasDeLaSemilla(): Promise<Plantilla[]> {
  const sql = await readFile(RUTA_SEMILLA, 'utf8');
  return [...sql.matchAll(FILA)].map(([, id, codigo, asunto, cuerpo, variables]) => ({
    id,
    tenantId: null,
    codigo,
    canal: 'CORREO',
    idioma: 'es',
    version: 1,
    asunto,
    cuerpo,
    variables: JSON.parse(variables) as VariableDeclarada[],
    plantillaBaseId: null,
    activa: true,
    creadoPor: null,
    creadoEn: CREADA,
  }));
}
