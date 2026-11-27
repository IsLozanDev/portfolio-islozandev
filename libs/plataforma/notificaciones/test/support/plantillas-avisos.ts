import { readFile } from 'node:fs/promises';
import type { Plantilla, VariableDeclarada } from '../../src/domain/plantilla.js';

const RUTA_SEMILLA = new URL('../../../../../db/01s_not_avisos_plataforma.sql', import.meta.url);
const RUTA_NOMBRES = new URL('../../../../../db/02b_not_plantilla_personalizable.sql', import.meta.url);
/** Cada rama del CASE que siembra el nombre: código y nombre. */
const NOMBRE = /WHEN '([A-Z_]+)'\s+THEN '([^']+)'/g;
const NO_PERSONALIZABLE = 'INTEGRIDAD_ROTA';
/** Cada fila del INSERT: id, NULL, código, canal, idioma, versión, asunto, cuerpo y variables (sin comillas simples dentro). */
const FILA = /'(44000000-[0-9a-f-]+)', NULL, '([A-Z_]+)', 'CORREO', 'es', 1,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'/g;
const CREADA = new Date('2026-11-24T00:00:00.000Z');

/** Las cuatro plantillas base tal como las siembran db/01s_not_avisos_plataforma.sql y 02b_not_plantilla_personalizable.sql. */
export async function plantillasDeLaSemilla(): Promise<Plantilla[]> {
  const sql = await readFile(RUTA_SEMILLA, 'utf8');
  const nombres = new Map([...(await readFile(RUTA_NOMBRES, 'utf8')).matchAll(NOMBRE)].map(([, codigo, nombre]) => [codigo, nombre]));
  return [...sql.matchAll(FILA)].map(([, id, codigo, asunto, cuerpo, variables]) => ({
    id,
    tenantId: null,
    codigo,
    nombre: nombres.get(codigo) ?? codigo,
    canal: 'CORREO',
    idioma: 'es',
    version: 1,
    asunto,
    cuerpo,
    variables: JSON.parse(variables) as VariableDeclarada[],
    plantillaBaseId: null,
    activa: true,
    personalizable: codigo !== NO_PERSONALIZABLE,
    creadoPor: null,
    creadoEn: CREADA,
  }));
}
