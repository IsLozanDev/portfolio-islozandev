# CLAUDE.md — Plataforma transversal (monorepo vitrina)

Componentes transversales (TR-*) que consumen todos los productos. Primer consumidor: SazónPOS. Un desarrollador, sprints de 2 semanas. Los specs se escriben en español.

## Fuentes de verdad (docs/)
- `docs/SRS_TR_Componentes_Transversales.xlsx`: RF, RNF, reglas TR-RN, criterios GWT. Los specs referencian por ID, no copian texto.
- `docs/Plataforma_Plan_Implementacion_Supabase_Auth.docx` y `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/`: plan, releases, sprints, estructura back/front, diagramas PL-01..PL-10, código base de ejemplo (`codigo/`).
- Si el SRS y el plan chocan, manda el plan (releases R0..R3). El SRS marca como "MVP" cosas que el plan reparte en R1/R2/R3.

## Stack
- Monorepo Nx + pnpm, Node 24 LTS, TypeScript 5.9 (ESM).
- Backend: NestJS 12, hexagonal, PostgreSQL 16 (Supabase), Redis 7, BullMQ.
- Frontend: **Angular 21** (standalone, signals, zoneless), Angular Material. Los docs dicen 22: decisión vigente es 21.
- Auth: Supabase Auth autentica; TR-SEG autoriza (ADR-29). JWT ES256 verificado por JWKS. El token solo lleva `tenant_id` y `tipo_usuario` (ADR-32).
- Supabase: un proyecto por ambiente. Acceso por MCP; credenciales las entrega el usuario cuando se pidan. Nunca en el repo.

## Alcance actual
R0 y R1 (sprints 0 a 12). R2 y R3 solo se especifican cuando toque.

## Reglas de arquitectura (constitución)
1. Cada componente TR es una lib en `libs/plataforma/<nombre>` con `domain · application · infrastructure · interface · test`. Solo expone `index.ts`.
2. El dominio no importa NestJS, TypeORM ni Supabase. Supabase solo en `infrastructure/supabase` y en `supabase/`.
3. Aislamiento por tenant con doble barrera: contexto de aplicación y RLS (`SET LOCAL app.tenant_id`). Ninguna consulta cruza tenants.
4. Cada caso de uso abre una transacción y escribe sus eventos en el outbox dentro de la misma transacción. Consumidores idempotentes por `event_id`.
5. Permisos con formato `producto.recurso.accion`, guard `@Permiso`; los sensibles exigen aal2. Todo endpoint con OpenAPI, bajo `/v1`.
6. Migraciones reversibles (script inverso por migración) y probadas en CI contra PostgreSQL 16. Las del esquema Supabase van en `supabase/migrations`; las de plataforma en `db/`.
7. `enforce-module-boundaries`: `scope:plataforma` no importa de productos; `scope:shared` no importa fuera de shared.
8. Los esquemas de plataforma no se exponen por la Data API de Supabase. Los frontends solo hablan con la API NestJS.
9. Secretos solo por entorno. La secret key de Supabase solo en `apps/api` y scripts de migración.
10. Integraciones externas detrás de puertos y adaptadores.

## RNF transversales que todo spec hereda
RNF-001/002/003 (desempeño), 008 (idempotencia), 010 (aislamiento), 011 (cifrado y secretos), 012 (OWASP ASVS 2), 013 y 112 (auditoría inmutable), 024 y 119 (límites de módulos), 025 (cobertura dominio >= 70 %), 026 (logs estructurados sin datos personales), 101 (permisos con caché), 106 (outbox).

## Definición de terminado (DoD)
Estructura hexagonal; pruebas de dominio e integración en CI; criterios GWT aprobados; migración reversible; `@Permiso` y OpenAPI; eventos por outbox; `nx affected` verde; probada en staging; horas reales registradas.

## Flujo de especificación (SDD)
- `/spec` y `/spec-impl` (skills en `.agents/skills`). Cada spec es `specs/NN-slug.md`, estado `Draft` hasta que el usuario lo apruebe.
- Lista y orden de specs: `docs/roadmap-specs.md`. Léelo antes de proponer o numerar un spec.
- Un spec = un componente TR, o un slice de un componente grande. Objetivo en una frase, tres áreas como máximo, cabe en 10 h.
- Orden de construcción según PL-10: kernel, ORG, SEG, luego CFG, SEQ, CAT, AUD, EVT, OBS. No se implementa un spec si su dependencia no está implementada.
- El código de `docs/.../codigo/` es base probada, no se copia a ciegas: cada spec declara qué se conserva y qué cambia.
- Un spec trae: RF, TR-RN, RNF propios, criterios GWT, tablas, eventos, permisos e historias del backlog que cubre.
- Nunca commit sin pedido explícito del usuario.
