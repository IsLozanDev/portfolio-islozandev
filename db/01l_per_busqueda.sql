-- 01l · Personas TR-PER: búsqueda por texto, fonética, documento y contacto (spec 38). PostgreSQL 16.
-- Reversible: rollback/01l_per_busqueda.sql. El inverso no borra las extensiones (son de la base, no de PER).

-- ---------------------------------------------------------------------
-- 1. Extensiones en el esquema de extensiones de Supabase; en el PostgreSQL de CI se crea si falta.
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
-- btree_gin: índices GIN con tenant_id + trigramas; sin él, en un tenant grande el planificador filtra fila por fila.
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions;

DO $$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA extensions TO %I', current_user);
END
$$;

-- ---------------------------------------------------------------------
-- 2. Normalización: minúsculas, sin tildes ni diéresis (ñ → n), solo letras y dígitos, un espacio entre
--    palabras. unaccent no es IMMUTABLE; con el diccionario explícito el resultado no depende del
--    search_path y la columna generada lo admite. SECURITY DEFINER: quien escribe personas no necesita
--    USAGE sobre extensions (es una función pura y sin search_path).
-- ---------------------------------------------------------------------
CREATE FUNCTION per.normalizar_busqueda(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY DEFINER SET search_path = ''
  AS $$
    SELECT btrim(regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texto, ''))),
      '[^a-z0-9]+', ' ', 'g'))
  $$;

-- ---------------------------------------------------------------------
-- 3. Clave fonética del español de Perú, palabra por palabra, sobre texto ya normalizado. Las reglas van
--    en el orden de la tabla del spec 38; cambiarlas obliga a otra migración que recalcule la columna.
-- ---------------------------------------------------------------------
CREATE FUNCTION per.clave_fonetica(texto_normalizado text) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = ''
  AS $$
DECLARE
  palabra text;
  clave text;
  claves text[] := '{}';
BEGIN
  FOREACH palabra IN ARRAY regexp_split_to_array(btrim(coalesce(texto_normalizado, '')), '\s+') LOOP
    CONTINUE WHEN palabra = '';
    -- La g de «gue/gui» queda en mayúscula hasta el final para que la regla 6 no la vuelva j.
    clave := regexp_replace(palabra, 'qu(?=[ei])', 'k', 'g');            -- 1
    clave := regexp_replace(clave, 'gu(?=[ei])', 'G', 'g');
    clave := regexp_replace(clave, '(hu|gu|wu)(?=[aeiou])', 'w', 'g');  -- 2
    clave := replace(clave, 'ch', 'x');                                  -- 3
    clave := replace(clave, 'll', 'y');                                  -- 4
    clave := regexp_replace(clave, 'y(?=[^aeiou]|$)', 'i', 'g');
    clave := regexp_replace(clave, 'c(?=[ei])', 's', 'g');               -- 5
    clave := replace(clave, 'z', 's');
    clave := regexp_replace(clave, '[cqk]', 'k', 'g');
    clave := regexp_replace(clave, 'g(?=[ei])', 'j', 'g');               -- 6
    clave := replace(clave, 'v', 'b');                                   -- 7
    clave := replace(clave, 'h', '');                                    -- 8
    clave := regexp_replace(clave, 'n(?=[bp])', 'm', 'g');               -- 9
    clave := regexp_replace(lower(clave), '(.)\1+', '\1', 'g');          -- 10
    claves := claves || clave;
  END LOOP;
  RETURN array_to_string(claves, ' ');
END
$$;

-- ---------------------------------------------------------------------
-- 4. Columnas generadas: la base las mantiene; el repositorio de escritura no las conoce. Sin concat_ws,
--    que es STABLE: la expresión de una columna generada debe ser IMMUTABLE.
-- ---------------------------------------------------------------------
ALTER TABLE per.persona
  ADD COLUMN busqueda_texto text GENERATED ALWAYS AS (per.normalizar_busqueda(
    coalesce(nombres, '') || ' ' || coalesce(apellido_paterno, '') || ' ' || coalesce(apellido_materno, '') || ' ' ||
    coalesce(razon_social, ''))) STORED,
  ADD COLUMN busqueda_fonetica text GENERATED ALWAYS AS (per.clave_fonetica(per.normalizar_busqueda(
    coalesce(nombres, '') || ' ' || coalesce(apellido_paterno, '') || ' ' || coalesce(apellido_materno, '') || ' ' ||
    coalesce(razon_social, '')))) STORED;

-- ---------------------------------------------------------------------
-- 5. Índices: trigram con tenant_id para texto y fonética (medido: 430 → 52 ms con 50 000 personas en un
--    tenant), prefijo para documento y contacto.
-- ---------------------------------------------------------------------
CREATE INDEX ix_persona_busqueda_texto ON per.persona USING gin (tenant_id, busqueda_texto extensions.gin_trgm_ops);
CREATE INDEX ix_persona_busqueda_fonetica ON per.persona USING gin (tenant_id, busqueda_fonetica extensions.gin_trgm_ops);
CREATE INDEX ix_persona_documento_prefijo ON per.persona (tenant_id, numero_documento text_pattern_ops);
CREATE INDEX ix_contacto_valor_prefijo ON per.contacto (tenant_id, lower(valor) text_pattern_ops);
