# Plan de implementación · Plataforma transversal (Supabase Auth)

Acompaña a **Plataforma_Plan_Implementacion_Supabase_Auth.docx** y **Plataforma_Plan_Cronograma_Sprints.xlsx**.

| Carpeta | Contenido |
|---|---|
| 1_Mermaid | PL-01 a PL-10: hoja de ruta, Gantt, arquitectura de autenticación, secuencias (ingreso con MFA, solicitud autorizada, invitación, migración de SazónPOS), integración, ambientes, dependencias |
| 2_Estructura | Árbol del backend y del frontend de la plataforma; reglas de límites de Nx |
| 3_plan.json | Fuente de datos del plan (sprints, backlog, hitos, feriados, riesgos) |
| codigo/supabase | Migración del hook de token y espejo auth.users → seg.usuario; pruebas SQL (16) |
| codigo/libs/plataforma/seguridad | Verificador JWKS, guards @Publico/@Permiso, caché de permisos, módulo NestJS 12; prueba de integración (18) |
| codigo/libs/shared/auth | Cliente Angular 22: sesión con signals, OAuth, MFA TOTP, interceptor, guards, *siPermiso |
| codigo/db | 01a_org.sql y 01b_seg.sql (prerrequisitos de la migración) |

## Cómo correr las pruebas

```bash
# SQL (PostgreSQL 15+ local; NO contra Supabase)
cd codigo/supabase && PGPASSWORD=... ./correr_pruebas.sh

# NestJS
cd codigo/libs/plataforma/seguridad && npm install && npm test
```

## Activar el hook en Supabase

Authentication → Hooks → Custom Access Token → Postgres → esquema `seg`, función `custom_access_token_hook`.
O en `supabase/config.toml`:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/seg/custom_access_token_hook"
```
