-- Deja los privilegios de arc.categoria como los dejó 01m_arc.sql: solo SELECT para el rol que migra.
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE (codigo) ON arc.categoria FROM %I', current_user);
END
$$;
