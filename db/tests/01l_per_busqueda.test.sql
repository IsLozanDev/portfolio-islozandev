-- Prueba de 01l_per_busqueda (spec 38). La ejecuta tools/migrar/test/db-esquemas.test.mjs sobre una base
-- temporal con db/ aplicado. Corre como superusuario; las columnas generadas se prueban con per_test_app,
-- sin BYPASSRLS y con los privilegios de la aplicación. Todo en una transacción que se revierte.

BEGIN;

-- ---------------------------------------------------------------------
-- Normalización y clave fonética.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  par record;
BEGIN
  IF per.normalizar_busqueda('Ñúñez  Pérez') <> 'nunez perez' THEN
    RAISE EXCEPTION 'normalizar «Ñúñez  Pérez» dio «%»', per.normalizar_busqueda('Ñúñez  Pérez');
  END IF;
  IF per.normalizar_busqueda('  Distribuidora Andina del Sur S.A.C. ') <> 'distribuidora andina del sur s a c' THEN
    RAISE EXCEPTION 'normalizar razón social dio «%»', per.normalizar_busqueda('  Distribuidora Andina del Sur S.A.C. ');
  END IF;
  IF per.normalizar_busqueda(NULL) <> '' THEN
    RAISE EXCEPTION 'normalizar NULL debía dar vacío';
  END IF;

  FOR par IN SELECT * FROM (VALUES
    ('Quispe', 'kispe'), ('Kispe', 'kispe'), ('Guillén', 'giyen'),
    ('Huamán', 'waman'), ('Guamán', 'waman'), ('Wamán', 'waman'), ('Wuamán', 'waman'),
    ('Chávez', 'xabes'), ('Llerena', 'yerena'), ('Yerena', 'yerena'), ('Montoya', 'montoya'), ('Rey', 'rei'),
    ('Cruz', 'krus'), ('Cecilia', 'sesilia'), ('Gimena', 'jimena'), ('Jimena', 'jimena'),
    ('Valdivieso', 'baldibieso'), ('Baldiviezo', 'baldibieso'), ('Jiménez', 'jimenes'), ('Gimenes', 'jimenes'),
    ('Hernández', 'ernandes'), ('Ernandes', 'ernandes'), ('Canpos', 'kampos'), ('Campos', 'kampos'),
    ('Carrasco', 'karasko'), ('Juana Quispe Mamani', 'juana kispe mamani'), ('DNI 45781236', 'dni 45781236')
  ) AS pares (nombre, esperado) LOOP
    IF per.clave_fonetica(per.normalizar_busqueda(par.nombre)) <> par.esperado THEN
      RAISE EXCEPTION 'clave de «%» dio «%», se esperaba «%»',
        par.nombre, per.clave_fonetica(per.normalizar_busqueda(par.nombre)), par.esperado;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- Columnas generadas al insertar y al cambiar nombres, con el rol de la aplicación.
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'per_test_app') THEN
    CREATE ROLE per_test_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA per TO per_test_app;  -- sin USAGE sobre extensions: normalizar_busqueda es SECURITY DEFINER
GRANT SELECT, INSERT, UPDATE ON per.persona TO per_test_app;

SET ROLE per_test_app;
SELECT set_config('app.tenant_id', '38000000-0000-0000-0000-00000000000a', false);

INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno)
VALUES ('38000000-0000-0000-0000-0000000000a1', '38000000-0000-0000-0000-00000000000a', 'NATURAL', 'DNI', '40236718', 'Rosa', 'Valdivieso', 'Chávez');
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, razon_social)
VALUES ('38000000-0000-0000-0000-0000000000a2', '38000000-0000-0000-0000-00000000000a', 'JURIDICA', 'RUC', '20601234565', 'Distribuidora Andina del Sur S.A.C.');

DO $$ BEGIN
  IF (SELECT busqueda_texto FROM per.persona WHERE id = '38000000-0000-0000-0000-0000000000a1') <> 'rosa valdivieso chavez' THEN
    RAISE EXCEPTION 'busqueda_texto de la natural no se generó bien';
  END IF;
  IF (SELECT busqueda_fonetica FROM per.persona WHERE id = '38000000-0000-0000-0000-0000000000a1') <> 'rosa baldibieso xabes' THEN
    RAISE EXCEPTION 'busqueda_fonetica de la natural no se generó bien';
  END IF;
  IF (SELECT busqueda_texto FROM per.persona WHERE id = '38000000-0000-0000-0000-0000000000a2') <> 'distribuidora andina del sur s a c' THEN
    RAISE EXCEPTION 'busqueda_texto de la jurídica no se generó bien';
  END IF;
END $$;

UPDATE per.persona SET apellido_materno = NULL, nombres = 'Rosa María' WHERE id = '38000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  IF (SELECT busqueda_texto FROM per.persona WHERE id = '38000000-0000-0000-0000-0000000000a1') <> 'rosa maria valdivieso' THEN
    RAISE EXCEPTION 'busqueda_texto no siguió al cambio de nombres';
  END IF;
END $$;

-- Las columnas generadas no se escriben a mano.
DO $$ BEGIN
  UPDATE per.persona SET busqueda_texto = 'otra' WHERE id = '38000000-0000-0000-0000-0000000000a1';
  RAISE EXCEPTION 'no falló';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> '428C9' THEN
    RAISE EXCEPTION 'escribir busqueda_texto: se esperaba 428C9 y llegó % (%)', SQLSTATE, SQLERRM;
  END IF;
END $$;

RESET ROLE;

-- ---------------------------------------------------------------------
-- Índices usados con 10 000 personas y 10 000 contactos en un tenant (como superusuario, sin RLS).
-- ---------------------------------------------------------------------
INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno)
SELECT gen_random_uuid(), '38000000-0000-0000-0000-00000000000b', 'NATURAL', 'DNI', lpad(serie::text, 8, '0'),
       (ARRAY['Juana', 'Carlos', 'Ana', 'Luis', 'Martha', 'Pedro', 'Rosa', 'Jorge'])[1 + serie % 8] || ' ' || serie,
       (ARRAY['Quispe', 'Mamani', 'Condori', 'Huamán', 'Flores', 'Rojas', 'Apaza', 'Ccori', 'Yépez'])[1 + serie % 9],
       -- Valdivieso en 1 de cada 500, como un apellido real: con uno de cada cinco, recorrer el tenant es más barato.
       CASE WHEN serie % 500 = 0 THEN 'Valdivieso' ELSE (ARRAY['Gutiérrez', 'Cárdenas', 'Llerena', 'Chávez'])[1 + serie % 4] END
  FROM generate_series(1, 10000) AS serie;
INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor, principal)
SELECT gen_random_uuid(), id, tenant_id, 'CELULAR', '9' || lpad(numero_documento, 8, '0'), true
  FROM per.persona WHERE tenant_id = '38000000-0000-0000-0000-00000000000b';
ANALYZE per.persona;
ANALYZE per.contacto;

CREATE FUNCTION pg_temp.plan_usa(consulta text, indice text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  linea text;
  plan text := '';
BEGIN
  FOR linea IN EXECUTE 'EXPLAIN ' || consulta LOOP
    plan := plan || linea || E'\n';
  END LOOP;
  IF plan LIKE '%Seq Scan on persona%' OR plan LIKE '%Seq Scan on contacto%' OR (indice IS NOT NULL AND plan NOT LIKE '%' || indice || '%') THEN
    RAISE EXCEPTION 'el plan no usa % o recorre la tabla:%', indice, E'
' || plan;
  END IF;
  RETURN true;
END
$$;

DO $$ BEGIN
  IF NOT pg_temp.plan_usa($q$SELECT id FROM per.persona WHERE tenant_id = '38000000-0000-0000-0000-00000000000b' AND busqueda_texto LIKE '%valdiv%'$q$, 'ix_persona_busqueda_texto') THEN
    RAISE EXCEPTION 'la búsqueda por texto no usa ix_persona_busqueda_texto';
  END IF;
  -- La forma que arma el adaptador: contiene, se parece (<%) o suena igual. Con 10 000 filas el planificador
  -- puede preferir el índice por tenant; basta con que no recorra la tabla (la medición de 50 000 va en la
  -- integración de personas).
  PERFORM set_config('pg_trgm.word_similarity_threshold', '0.35', true);
  IF NOT pg_temp.plan_usa($q$SELECT id FROM per.persona WHERE tenant_id = '38000000-0000-0000-0000-00000000000b'
       AND (busqueda_texto LIKE '%baldiviezo%' OR 'baldiviezo' OPERATOR(extensions.<%) busqueda_texto
            OR busqueda_fonetica LIKE '%' || per.clave_fonetica('baldiviezo') || '%')$q$, NULL) THEN
    RAISE EXCEPTION 'la búsqueda combinada recorre la tabla';
  END IF;
  IF NOT pg_temp.plan_usa($q$SELECT id FROM per.persona WHERE tenant_id = '38000000-0000-0000-0000-00000000000b' AND busqueda_fonetica LIKE '%baldibies%'$q$, 'ix_persona_busqueda_fonetica') THEN
    RAISE EXCEPTION 'la búsqueda fonética no usa ix_persona_busqueda_fonetica';
  END IF;
  IF NOT pg_temp.plan_usa($q$SELECT id FROM per.persona WHERE tenant_id = '38000000-0000-0000-0000-00000000000b' AND numero_documento LIKE '00004%'$q$, 'ix_persona_documento_prefijo') THEN
    RAISE EXCEPTION 'el prefijo de documento no usa ix_persona_documento_prefijo';
  END IF;
  IF NOT pg_temp.plan_usa($q$SELECT persona_id FROM per.contacto WHERE tenant_id = '38000000-0000-0000-0000-00000000000b' AND lower(valor) LIKE '900004%'$q$, 'ix_contacto_valor_prefijo') THEN
    RAISE EXCEPTION 'el prefijo de contacto no usa ix_contacto_valor_prefijo';
  END IF;
END $$;

ROLLBACK;
