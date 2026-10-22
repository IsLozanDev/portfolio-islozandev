import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const BLOQUEO = 7_282_001;

async function listarSql(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function conectar(url) {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  await cliente.query('SELECT pg_advisory_lock($1)', [BLOQUEO]);
  await cliente.query('CREATE SCHEMA IF NOT EXISTS migraciones');
  await cliente.query(
    'CREATE TABLE IF NOT EXISTS migraciones._migraciones (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())',
  );
  return cliente;
}

async function aplicar(cliente, archivo, sql, registro) {
  try {
    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query(registro, [archivo]);
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw new Error(`Falló ${archivo}: ${error.message}`);
  }
}

async function exigirInversos(archivos, dir) {
  const inversos = new Set(await listarSql(join(dir, 'rollback')));
  const faltan = archivos.filter((a) => !inversos.has(a));
  if (faltan.length > 0) throw new Error(`Falta el script inverso en ${join(dir, 'rollback')} para: ${faltan.join(', ')}`);
}

async function aplicadas(cliente) {
  // COLLATE "C": mismo orden byte a byte que el sort de listarSql (la collation de la base ignora `.` y `_`).
  const { rows } = await cliente.query('SELECT nombre FROM migraciones._migraciones ORDER BY nombre COLLATE "C"');
  return rows.map((r) => r.nombre);
}

export async function subir({ url, dir }) {
  const archivos = await listarSql(dir);
  await exigirInversos(archivos, dir);
  const cliente = await conectar(url);
  try {
    const hechas = new Set(await aplicadas(cliente));
    const pendientes = archivos.filter((a) => !hechas.has(a));
    for (const archivo of pendientes) {
      await aplicar(cliente, archivo, await readFile(join(dir, archivo), 'utf8'), 'INSERT INTO migraciones._migraciones (nombre) VALUES ($1)');
    }
    return pendientes;
  } finally {
    await cliente.end();
  }
}

// Solo revierte las del directorio: db/ y supabase/migrations comparten la tabla de registro.
export async function bajar({ url, dir }) {
  const delDirectorio = new Set(await listarSql(dir));
  const cliente = await conectar(url);
  try {
    const revertir = (await aplicadas(cliente)).filter((a) => delDirectorio.has(a)).reverse();
    await exigirInversos(revertir, dir);
    for (const archivo of revertir) {
      await aplicar(cliente, archivo, await readFile(join(dir, 'rollback', archivo), 'utf8'), 'DELETE FROM migraciones._migraciones WHERE nombre = $1');
    }
    return revertir;
  } finally {
    await cliente.end();
  }
}
