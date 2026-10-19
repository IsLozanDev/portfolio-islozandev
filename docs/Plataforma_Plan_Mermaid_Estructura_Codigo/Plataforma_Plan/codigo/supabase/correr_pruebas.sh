#!/bin/bash
# Uso: PGPASSWORD=... ./correr_pruebas.sh  (PostgreSQL 15+ local, NO Supabase)
set -e
cd "$(dirname "$0")"
DB=auth_test; H=${PGHOST:-127.0.0.1}; U=${PGUSER:-postgres}
psql -h $H -U $U -qc "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
for f in tests/00_*.sql ../db/01a_org.sql ../db/01b_seg.sql migrations/*.sql tests/99_*.sql; do
  echo "== $f"; psql -h $H -U $U -d $DB -q -v ON_ERROR_STOP=1 -f "$f"
done
