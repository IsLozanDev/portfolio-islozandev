# Contexto para cms-sitio-dominio-seo

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas Módulos, Actores, Procesos, Reglas de negocio, RF, Criterios GWT, RNF, Componentes, Consumidores), `plan.md` (backlog R3, ADR-29/32, sección 6), `3_plan.json`, `2_Estructura/`, `1_Mermaid/PL-10`, diagramas de diseño T-08, T-S6, A-05, A-06, código real del repo.

## 1. Alcance y dependencias
- Historia R3-05 (sprint 21, release R3, 16 h, tipo Full): "Sitio público, dominio, páginas por bloques y SEO" (RF 119, 120, 123). Este paquete cubre la parte de sitio, dominio, marca (RF-119) y SEO (RF-123). Páginas, bloques y render SSR están en `cms-paginas-bloques-render.md`.
- PL-10: `ARC --> CMS --> POR`. TR-CMS depende de TR-ARC (R2-03, logo, favicon, imagen OG) y, por el SRS, de TR-ORG (sucursal principal para JSON-LD) y TR-EVT. Habilita TR-POR (el portal se monta en el sitio y resuelve el tenant por dominio).
- Consumidores (hoja Consumidores): 9 sistemas, todos "E" (extiende) salvo LIB "C". Forma: administración en `plataforma-admin-cliente` (embebida en cada `<cod>-backoffice`) y render SSR en `<cod>-web`. Primer consumidor real: PsicoAgenda (`psi-web`, A-05), no SazónPOS.
- Partición de R3-05 (16 h en el plan; estimación realista 28 h, ver P1): cuatro specs de 10 h o menos, dos en este paquete.

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| A | cms-sitio-dominio-marca | 119 (back + UI admin) | 8 | 07 (permisos), 11 (outbox), 15 (shell/UI), spec de TR-ARC (R2-03) |
| B | cms-paginas-bloques | 120 back + editor | 9 | A (ver otro paquete) |
| C | cms-render-ssr | 120 render, caché CDN | 8 | B (ver otro paquete) |
| D | cms-seo-sitemap | 123 | 4 | B y C |

- Áreas de A: (a) dominio `Sitio`, `Dominio`, `Marca` + DDL `cms` + RLS; (b) puerto `ProveedorDominios` (alta de host, verificación DNS, TLS) y tarea periódica de verificación en el worker; (c) pantalla "Sitio" en admin-cliente.
- Áreas de D: (a) VO `Seo` en `Pagina` y validación de longitudes con advertencia; (b) `sitemap.xml`, `robots.txt` generados desde páginas publicadas indexables; (c) JSON-LD `LocalBusiness` desde la sucursal principal (TR-ORG).
- Fuera de alcance: páginas y bloques (B), render (C), menús, banners, galería, noticias, formularios (`cms-medios-noticias-formularios.md`), portal (TR-POR), multi-idioma (T-08 trae `idioma`, el SRS no lo pide), versiones históricas navegables.
- Constitución aplicable: reglas 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 (TypeORM); código limpio; estructura de libs Angular; Diseño UI (solo admin); verificación Playwright; DoD completo.

## 2. RF
Módulo MOD-18 (TR-CMS), proceso TR-P07, app APP-02, IA: No.
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-119 | Configurar sitio público y dominio | plat.cms.sitio | APP-02 | TR-RN-042, 027 | TR-RNF-123, 027, 011 | Administrador del cliente, Editor de contenidos web |
| TR-RF-123 | Configurar SEO del sitio y páginas | plat.cms.seo | APP-02 | TR-RN-042 | TR-RNF-004, 019 | Editor de contenidos web |

Prioridad: 119 Must, 123 Should. Fase SRS: MVP (el plan los pone en R3).
- **119** precondición: el tenant tiene un producto con sitio público (`<cod>-web`) suscrito. Flujo: 1) subdominio de la plataforma (ej. `donlucho.sazonpos.pe`) o dominio propio; 2) para dominio propio se muestra el CNAME o TXT y se verifica periódicamente; 3) verificado, se emite TLS y se activa; 4) logo, favicon y colores generan los tokens de diseño del sitio. Datos: `subdominio` (3-40, minúsculas, único global), `dominio_propio` (FQDN opcional), `estado_dominio` (PENDIENTE_DNS|VERIFICADO|ACTIVO|ERROR), `logo` (SVG/PNG <= 1 MB), `favicon`, `color_primario`, `color_secundario` (hex), `tipografia` (lista permitida). Salida: sitio accesible en su dominio con la marca del cliente. Componentes: TR-CMS, TR-ARC, TR-ORG.
- **123** precondición: existen páginas publicadas. Flujo: campos SEO por página; validación de longitudes con vista previa del resultado de búsqueda; al publicar regenera `sitemap.xml`; inserta JSON-LD con datos de la sucursal principal. Datos: `titulo_seo` (10-60), `descripcion_seo` (50-160), `imagen_og` (1200x630), `canonica` (URL), `indexable` (bool), `datos_estructurados` (JSON-LD generado). Componentes: TR-CMS, TR-ORG.
- Interfaz (hoja Componentes): TR-CMS provee librería Angular; administración de sitio, páginas, menús, medios, noticias, SEO y formularios; SSR con caché CDN; evento `cms.pagina_publicada`.

## 3. Criterios GWT
- **TR-CA-289** (119, Positivo, "Subdominio inmediato"): la pollería sin sitio elige «donlucho» -> disponible en `donlucho.sazonpos.pe` con certificado válido.
- **TR-CA-290** (119, Negativo, "Dominio sin verificar"): `www.polleriadonlucho.pe` sin CNAME -> sigue PENDIENTE_DNS y muestra el registro a crear.
- **TR-CA-291** (119, Negativo, "Subdominio ocupado"): «donlucho» de otro tenant -> «El subdominio no está disponible».
- **TR-CA-299** (123, Positivo, "Sitemap actualizado"): 8 páginas indexables, se publica la novena -> `sitemap.xml` lista 9 con fecha de modificación.
- **TR-CA-300** (123, Borde, "Descripción demasiado larga"): descripción de 190 caracteres -> advierte que se mostrarán 160 y permite guardar.

Estado en el SRS: Pendiente. Faltan criterios (proponer): marca aplicada (tokens generados y logo visible en el sitio); logo > 1 MB o MIME no permitido rechazado (TR-RN-027); dominio que pasa a ACTIVO y TLS emitido; dominio propio ya usado por otro tenant; página `indexable=false` fuera del sitemap y con `noindex`; `robots.txt` apuntando al sitemap; JSON-LD con dirección de la sucursal principal; aislamiento (TR-RNF-010): el sitio de un host nunca muestra datos de otro tenant. Contradicción: TR-CA-300 permite guardar 190 caracteres, pero el campo dice 50-160 (ver P5).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-042 | Slug único por sitio; dominio propio solo se activa tras verificar DNS y emitir TLS; contenido programado se publica en la hora indicada en America/Lima. |
| TR-RN-027 | Archivos con MIME permitido y tamaño máximo, SHA-256, antivirus, URL firmada <= 15 min (TR-ARC; aplica a logo, favicon, imagen OG). |
| TR-RNF-123 | (Propio MOD-18) SSR con caché CDN e invalidación al publicar: TTFB p95 < 600 ms; publicado visible en <= 60 s; pruebas sintéticas desde Lima y Arequipa. |
| TR-RNF-004 | Portales públicos con Core Web Vitals en móvil: LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1 (p75, Lighthouse CI). |
| TR-RNF-019 | Portales públicos WCAG 2.1 AA; 0 errores críticos (axe-core en CI). |
| TR-RNF-027 | Configuración por tenant (marca, plantillas) sin cambios de código. |
| TR-RNF-011 | TLS 1.2+ en todos los endpoints (incluye dominios propios); secretos en gestor. |
| TR-RNF-010 | Aislamiento por tenant, doble barrera; el host del sitio no puede cruzar tenants. |

Heredados por CLAUDE.md: 001/002/003, 008, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-05 | 21 | 16 | TR-CMS | Sitio público, dominio, páginas por bloques y SEO | TR-RF-119, 120, 123 | Full | R3 |

Relacionadas: R3-06 (menús, noticias, formularios, sprint 22), R3-07 (portal, sprint 22), R2-03 (archivos TR-ARC, sprint 13), R2-01 (personas). Sprint 21 (09/08/2027-22/08/2027) "CMS: sitio, páginas por bloques, SEO", 16/20 h. Hito H5: producción R3 el 05/10/2027.

## 6. Tablas SQL, eventos, puertos y permisos
- **Esquema `cms`** (nuevo, PL-03 no lo dibuja). Propuesta: `cms.sitio` (id, tenant_id, producto_codigo, subdominio UNIQUE global, estado, marca jsonb {logo_archivo_id, favicon_archivo_id, color_primario, color_secundario, tipografia}, idioma 'es-PE', version, auditoría de filas); `cms.dominio` (id, sitio_id, tenant_id, host UNIQUE global, principal, estado PENDIENTE_DNS|VERIFICADO|ACTIVO|ERROR, registro_dns jsonb, verificado_en, ultimo_error); SEO dentro de la página (`cms.pagina.seo` jsonb o columnas, ver otro paquete). UNIQUE `(tenant_id, producto_codigo)` en sitio: un sitio por producto suscrito (T-08: `productoCodigo`).
- **Resolución pública por host**: función `cms.sitio_por_host(p_host)` `SECURITY DEFINER` que devuelve sitio y tenant sin contexto de tenant (el visitante es anónimo). Mismo patrón que `seg.usuario_para_ingreso` (spec 18b): rol `org_lector` limitado.
- **RLS** por `app.tenant_id` en todas las tablas `cms` (patrón `db/01a_org.sql`); REVOKE a `anon, authenticated` (regla 8, como `20261102000000_seg_supabase_auth.sql`).
- **Migración**: `db/01<letra>_cms.sql` + `db/rollback/` + `db/tests/`, con la siguiente letra libre al implementar (hoy la última es `01i_seg_vigencia_peru.sql`; R2 y TR-PAG/TR-REP consumirán varias antes).
- **Eventos**: SRS solo define `cms.pagina_publicada` (RF-120). Propuestos (sin RF): `cms.sitio.configurado`, `cms.dominio.activado` (para invalidar caché de host y CORS). Convención del repo: `<entidad>.<hecho>` (`rol.creado`, `catalogo.actualizado`) o `<comp>.<entidad>.<hecho>` (`aud.integridad.rota`); T-S6 usa `cms.pagina.publicada` y el SRS `cms.pagina_publicada` (ver P6).
- **Puertos** (lib `libs/plataforma/cms`, comp:cms): `ProveedorDominios` (registrar host, estado de verificación, TLS; adaptador Vercel porque los frontends ya se despliegan en Vercel, spec 21), `ResolutorDns` (comprobar CNAME/TXT), `ArchivosPort` (TR-ARC, R2), `OrganizacionLectura` (sucursal principal para JSON-LD; hoy `org.sucursal` tiene dirección y ubigeo, no horario).
- **Permisos** (SRS, se registran en `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json`, módulo nuevo "contenidos"): `plat.cms.sitio`, `plat.cms.seo`. Endpoints `/v1/cms/sitio` (admin, `@Permiso`) y `GET /v1/cms/publico/sitio?host=` (`@Publico`, con límite de tasa TR-RNF-015).
- **Etiquetas Nx**: back `scope:plataforma`, `type:backend`, `comp:cms`; front `plataforma/cms-editor` `type:feature`; `plataforma/cms-render` `type:ui` o `feature` (ver otro paquete).

## 7. Código base relacionado
- **Existe y se reutiliza**: `libs/plataforma/kernel` (`TenantContext`, `UnitOfWork`, `EventPublisher`, `Clock`); `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`, `AlsTenantContext`); `seguridad` (`Permiso`, `Publico`, `PermisoGuard`, manifiesto); `org` (`Sucursal`, `PRODUCTOS`, `Ubigeo`); `auditoria` (`AuditoriaPort`, `@Auditable` para cambio de dominio); `eventos` (`SuscribirEvento`, relay); `apps/worker` (BullMQ, para verificación DNS periódica); `libs/shared/ui` (tabla, panel lateral, chips, `AvisosService`); `libs/plataforma/admin-cliente` (rutas lazy donde se monta la pantalla).
- **Patrones**: `db/01b_seg_tipos_ingreso.sql` (función `SECURITY DEFINER` sin tenant para resolución anónima); `apps/plataforma-admin/vercel.json` (reescritura `/v1` a Railway).
- **Falta**: lib `libs/plataforma/cms`, `libs/plataforma/cms-editor`, esquema `cms`, adaptador de dominios, TR-ARC (R2-03, no implementado aún), app `<cod>-web` (no hay apps de producto en el monorepo). Nada de CMS en `docs/.../codigo/`.

## 8. Diagramas relevantes
- `1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd` (ARC -> CMS -> POR).
- `.../8_Diseno_Piloto/2_Plataforma_Transversal/T-08_Modelo_de_dominio_Contenidos_web_CMS_y_portal_del_cliente.mmd` (Sitio, Dominio, Marca, Seo).
- `.../2_Plataforma_Transversal/T-S6_Secuencia_Publicacion_de_contenido_y_render_SSR_del_sitio.mmd` (`GET /v1/cms/sitio?host=&slug=`).
- `.../1_Arquitectura/A-05_Frontend_de_PsicoAgenda_aplicaciones_y_librerias.mmd`, `A-06_Frontend_de_la_plataforma_transversal.mmd` (cms-editor embebido, cms-render en `psi-web`).
- `.../1_Arquitectura/A-09_Despliegue_y_entornos.mmd` (CDN y dominios).

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- Diseño UI de CLAUDE.md aplica a la pantalla de admin (tokens esmeralda, `vit-*`). El sitio público lleva la marca del tenant (RF-119): sus tokens no son los de `tema.css` ni el tema M3 esmeralda. CLAUDE.md no dice nada del sitio público.
- El subdominio es de la plataforma (`*.sazonpos.pe`), pero cada producto tiene su dominio comercial. No se dice qué dominio base usa cada producto ni quién compra el comodín TLS.
- Dominio propio con TLS automático depende del proveedor de hosting; el plan solo dice Vercel para frontends.
- JSON-LD `LocalBusiness` pide horario; `org.sucursal` no tiene horario.
- Permisos `plat.cms.sitio` y `plat.cms.seo` no siguen `producto.recurso.accion` estricto (la acción es el recurso).

Preguntas, con recomendación:
1. ¿R3-05 cabe en 16 h? Recomendación: no. Partir en A (8), B (9), C (8), D (4) = 29 h y replanificar sprint 21-22, igual que se hizo con 16/17 en R1.
2. ¿Cómo se emite TLS y se sirve un dominio propio? Recomendación (A-09 ya dibuja "Vercel producción · dominios por tenant"): puerto `ProveedorDominios` con adaptador Vercel (dominios por API, certificado automático); subdominios con comodín ya verificado. Verificación DNS periódica en el worker (cada 10 min, máx. 72 h, luego ERROR).
3. ¿Marca del sitio público? Recomendación: `Marca` genera variables CSS propias del sitio (`--sitio-primario`, etc.) que consume `cms-render`; no se reutiliza el tema esmeralda. El admin del CMS sigue Diseño UI de CLAUDE.md. Contraste AA verificado al guardar (TR-RNF-019): rechazar o advertir.
4. ¿Tipografías permitidas? Recomendación: lista cerrada de 6 Google Fonts en constante del dominio; sin subida de fuentes.
5. ¿Descripción SEO > 160? Recomendación: aceptar hasta 300 con advertencia (TR-CA-300 manda sobre el rango); título SEO igual con 60 recomendado.
6. ¿Nombre del evento? Recomendación: `cms.pagina.publicada` (T-S6, igual que `aud.integridad.rota`) en `EVENTOS_CMS`, anotando la diferencia con el SRS.
7. ¿Horario en JSON-LD? Recomendación: omitir `openingHours` hasta que ORG tenga horario; solo nombre, dirección, teléfono y logo.
8. ¿Un sitio por tenant o por producto? Recomendación: por `(tenant, producto)` como T-08; un tenant con dos productos tiene dos sitios.
