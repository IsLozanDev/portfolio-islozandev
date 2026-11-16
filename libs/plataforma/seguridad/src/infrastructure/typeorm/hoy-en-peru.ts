/** Hoy en Perú, en SQL. Las vigencias se guardan con esa fecha (`fechaLocal`); `current_date` es la de la sesión, UTC en Supabase. */
export const HOY_EN_PERU = `(now() AT TIME ZONE 'America/Lima')::date`;
