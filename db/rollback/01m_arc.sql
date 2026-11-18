-- Deja la base como la dejó 01l_per.sql: el esquema arc no existía. Los objetos del bucket no se
-- tocan: se borran por la Storage API. El rol org_lector no se borra: es del clúster.
DROP SCHEMA arc CASCADE;
