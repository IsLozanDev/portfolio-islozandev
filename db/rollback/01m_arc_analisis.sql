-- Deja arc como lo dejó 01m_arc.sql: sin la función del barrido ni su índice. No toca filas.
DROP FUNCTION arc.archivos_en_analisis_atascados(timestamptz, integer);
DROP INDEX arc.ix_archivo_en_analisis;
