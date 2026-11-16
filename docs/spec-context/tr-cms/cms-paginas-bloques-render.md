# Contexto para cms-paginas-bloques-render

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores), `plan.md` (backlog R3, sección 6 estructura front, 6.1 pantallas), `3_plan.json`, `2_Estructura/estructura_frontend.txt` y `estructura_backend.txt`, PL-10, T-08, T-S6, A-05, A-06, A-09, `specs/21-obs-y-staging.md`, código real del repo.

## 1. Alcance y dependencias
- Historia R3-05 (sprint 21, R3, 16 h, Full), parte RF-120: páginas por bloques, publicación con versión, invalidación de caché del CDN, evento de publicación y render SSR en `<cod>-web`. Sitio, dominio y SEO en `cms-sitio-dominio-seo.md`.
- PL-10: `ARC --> CMS --> POR`. Dependencias reales: sitio configurado (parte A), TR-ARC (R2-03, imágenes de bloques), TR-EVT (spec 11, outbox), TR-SEG (spec 07). El bloque dinámico (TR-CA-294) depende de que un producto aporte su bloque.
- Plan: libs front `libs/plataforma/cms-editor` (embebida en `<cod>-backoffice`, A-06) y `libs/plataforma/cms-render` ("componentes de bloques para SSR", A-05; plan 6.1: R3 shared `cms-render`). Back `libs/plataforma/cms` (`estructura_backend.txt`: `cms/ (R3) TR-CMS`).
- Partición propuesta (la del paquete del sitio: A 8, B 9, C 8, D 4):

| Parte | Slug | Alcance | h | Depende de |
|---|---|---|---|---|
| B | cms-paginas-bloques | Agregado `Pagina` + `VersionPagina` + `Bloque`, borrador, publicar, despublicar, ordenar; API admin; editor en `cms-editor` con vista previa escritorio/móvil | 9 | A, 15 (UI), TR-ARC |
| C | cms-render-ssr | Endpoint público de lectura, `cms-render` (componente por tipo de bloque), app SSR de referencia, caché CDN e invalidación por publicación, registro de bloques dinámicos | 8 | B |

- Áreas de B: (a) dominio y DDL (`cms.pagina`, `cms.version_pagina`, bloques en JSON validado por tipo); (b) casos de uso con UoW + outbox (`cms.pagina.publicada`) y `@Auditable`; (c) editor Angular (lista, formulario de página, lista ordenable de bloques, vista previa).
- Áreas de C: (a) `GET /v1/cms/publico/pagina?host=&slug=` `@Publico` con límite de tasa y ETag; (b) `cms-render` + app SSR (Angular 21 `@angular/ssr`); (c) puerto `CachePublicacion` (purga CDN) consumido por un suscriptor del evento, y puerto de bloques dinámicos.
- Fuera de alcance: SEO, sitemap y JSON-LD (D); menús y medios (R3-06); editor WYSIWYG libre (solo bloques con formulario); flujo de aprobación; programación de páginas (RF-122 la pide solo para noticias; T-08 trae `publicarEn` en `Pagina`, ver P5); restaurar versiones antiguas.
- Constitución: reglas 1-11; estructura de libs Angular; Diseño UI (solo editor); verificación Playwright; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-120 | Gestionar páginas por bloques | plat.cms.pagina | APP-02 | TR-RN-042 | TR-RNF-123, 019, 004 | Editor de contenidos web |

Must, fase SRS MVP (plan R3), IA No, proceso TR-P07.
- Precondición: el sitio está configurado.
- Flujo: 1) crea página con título y slug; 2) agrega y ordena bloques y completa su contenido; 3) guarda borrador y previsualiza en escritorio y móvil; 4) publica: genera versión, invalida caché del CDN y publica `cms.pagina_publicada`.
- Datos: `titulo` (3-120); `slug` (1-80, minúsculas y guiones, único por sitio); `bloques[]` (tipo, orden, contenido JSON); `estado` (BORRADOR|PUBLICADA|DESPUBLICADA); `version` (entero). Tipos de bloque: hero, texto, galería, servicios, testimonios, mapa, llamada a la acción, bloque dinámico del producto.
- Salida: página publicada visible en <= 60 s. Componentes: TR-CMS, TR-ARC, TR-EVT.
- Secuencia de referencia T-S6: `PUT /v1/cms/paginas/:id/borrador`; `POST /v1/cms/paginas/:id/publicar`; `VersionPagina n PUBLICADA` + outbox; purga CDN del path; en cache miss el SSR pide `GET /v1/cms/sitio?host=&slug=` y recibe marca, menú, bloques publicados y SEO; HTML en caché 10 min.

## 3. Criterios GWT
- **TR-CA-292** (Positivo, "Página de nosotros"): la clínica publica «Nuestros especialistas» con slug `especialistas` -> visible en `/especialistas` en menos de 60 s.
- **TR-CA-293** (Negativo, "Slug repetido"): existe `contacto`, se crea otra igual -> «El slug ya está en uso en este sitio».
- **TR-CA-294** (Borde, "Bloque dinámico del producto"): REST provee «Carta del día»; el editor lo agrega a la portada y publica -> la portada muestra la carta vigente obtenida del producto al renderizar.

Estado: Pendiente. Faltan (proponer): borrador no visible en el sitio público; despublicar devuelve 404 (o 410) en <= 60 s; reordenar bloques cambia el orden renderizado; bloque con contenido inválido para su tipo rechazado; edición concurrente rechazada por `version` (bloqueo optimista, regla 11); host de otro tenant no ve la página (TR-RNF-010); TTFB p95 < 600 ms y Lighthouse/axe en CI (TR-RNF-123, 004, 019); slug con mayúsculas o espacios rechazado.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-042 | Slug único por sitio; dominio propio solo tras DNS + TLS; programados en hora de America/Lima. |
| TR-RNF-123 | SSR con caché CDN e invalidación al publicar; TTFB p95 < 600 ms; publicado visible en <= 60 s; sintéticas desde Lima y Arequipa. |
| TR-RNF-004 | Core Web Vitals móvil: LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1 (p75). |
| TR-RNF-019 | WCAG 2.1 AA en portales públicos; axe-core en CI. |
| TR-RNF-015 | Límite de tasa por IP en endpoints públicos (lectura pública del sitio). |
| TR-RNF-106 | Outbox al menos una vez, p95 < 5 s: la purga del CDN por evento debe caber en los 60 s. |
| TR-RNF-008 | Publicar dos veces la misma versión no duplica versión ni purga (idempotente). |

Heredados por CLAUDE.md: 001/002/003, 010, 011, 012, 013/112, 024/119, 025, 026, 101.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-05 | 21 | 16 | TR-CMS | Sitio público, dominio, páginas por bloques y SEO | TR-RF-119, 120, 123 | Full | R3 |

Relacionadas: R3-06 (menús, banners, galería: comparten `cms-render`), R3-07 (portal montado en `<cod>-web`), R2-03 (TR-ARC), spec 11 (relay), spec 21 (Vercel + Railway). Plan 6.1: R3 en admin-cliente "CMS"; en shared `cms-render`, `portal-cuenta`.

## 6. Tablas SQL, eventos, puertos y permisos
- **Tablas** (esquema `cms`, misma migración o una segunda `db/01<letra>_cms_paginas.sql`): `cms.pagina` (id, tenant_id, sitio_id, slug, titulo, estado, version_publicada, seo jsonb, version para bloqueo optimista; UNIQUE `(sitio_id, slug)`); `cms.version_pagina` (pagina_id, numero, estado BORRADOR|PUBLICADA, bloques jsonb, autor_id, creada_en; una sola PUBLICADA por página con índice parcial). T-08 modela `Bloque` como entidad; propuesta: JSON en la versión, validado por esquema de tipo en el dominio (ver P2). RLS por tenant; REVOKE a `anon, authenticated`.
- **Lectura pública**: función `SECURITY DEFINER` `cms.pagina_publicada(p_host, p_slug)` que resuelve host -> sitio -> versión PUBLICADA, sin contexto de tenant; o resolución de tenant por host y luego RLS normal (preferible, ver P3).
- **Eventos**: `cms.pagina.publicada` (SRS `cms.pagina_publicada`; payload: sitio_id, pagina_id, slug, version, hosts); propuestos `cms.pagina.despublicada`. Esquema registrado como `ESQUEMAS_CAT`/`registrarEsquemasCat`.
- **Puertos**: `CachePublicacion.purgar(hosts, paths)` (adaptador Vercel; nulo en local); `ProveedorBloquesDinamicos` (registro por producto: `tipo`, `esquema`, resolución en render; en el front, token de inyección `BLOQUES_DINAMICOS` con componentes del producto); `ArchivosPort` (TR-ARC).
- **Permisos**: `plat.cms.pagina` (SRS; un solo permiso para editar y publicar). T-S6 usa `cms.pagina.publicar`, que no sigue el prefijo de producto (ver P4).
- **App SSR**: no existe ninguna app de producto en el monorepo (`apps/` = api, worker, plataforma-admin, plataforma-consola). `<cod>-web` vive en el repo del producto o se crea aquí (ver P1).
- **Etiquetas Nx**: `libs/plataforma/cms` `scope:plataforma, type:backend, comp:cms`; `cms-editor` `type:feature`; `cms-render` `type:ui` (sin `HttpClient`, recibe el modelo) con un `data-access` aparte o dentro de la app.

## 7. Código base relacionado
- **Existe**: `kernel` (`AggregateRoot`, `DomainEvent`, `UnitOfWork`), `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`), `eventos` (`SuscribirEvento` para el suscriptor de purga), `auditoria` (`@Auditable` en publicar/despublicar), `seguridad` (`Permiso`, `Publico`), `catalogos` (patrón ETag/304 y caché Redis por versión en `GET /v1/catalogos/{codigo}/items`, spec 19a: reutilizable para la lectura pública), `shared/ui` (`vit-tabla`, `PanelLateralService`, `AvisosService`, `vit-acciones-formulario`), `admin-cliente` (rutas lazy).
- **Despliegue**: `apps/plataforma-admin/vercel.json` reescribe `/v1/*` a Railway; mismo patrón sirve para `<cod>-web` (mismo origen, sin CORS por dominio propio).
- **Falta**: todo el CMS; `@angular/ssr` no está en el monorepo; adaptador de purga CDN; TR-ARC. Nada en `docs/.../codigo/`.

## 8. Diagramas relevantes
- `.../2_Plataforma_Transversal/T-S6_Secuencia_Publicacion_de_contenido_y_render_SSR_del_sitio.mmd` (secuencia completa).
- `.../2_Plataforma_Transversal/T-08_Modelo_de_dominio_Contenidos_web_CMS_y_portal_del_cliente.mmd` (Pagina, VersionPagina, Bloque).
- `.../1_Arquitectura/A-05_Frontend_de_PsicoAgenda_aplicaciones_y_librerias.mmd` (`psi-web` SSR monta `cms-render`).
- `.../1_Arquitectura/A-06_Frontend_de_la_plataforma_transversal.mmd` (`cms-editor` embebido).
- `.../1_Arquitectura/A-09_Despliegue_y_entornos.mmd`; `1_Mermaid/PL-10_...mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- `<cod>-web` no existe y el primer consumidor (PsicoAgenda) llega con R3. Sin una app SSR no se puede verificar TR-CA-292 ni TR-RNF-123.
- Bloque dinámico (TR-CA-294) usa REST (SazónPOS, otro repo); no hay contrato de contribución.
- T-S6 cachea el HTML 10 min y purga por path; RNF-123 exige <= 60 s: la purga es la que garantiza el plazo, no el TTL.
- Diseño UI de CLAUDE.md aplica al editor; `cms-render` usa la marca del tenant y su propio set de bloques, no `vit-*`.
- "Previsualiza en escritorio y móvil": no se dice si es render real (SSR con token de vista previa) o simulado en el editor.

Preguntas, con recomendación:
1. ¿Dónde vive la app SSR? Recomendación: crear `apps/plataforma-web` (Angular 21 SSR) como sitio de referencia multi-tenant por host, desplegado en Vercel; cada `<cod>-web` la imita importando `cms-render`. Así C se verifica en este repo con Playwright.
2. ¿Bloques como entidad o JSON? Recomendación: JSON por versión con esquema por tipo validado en el dominio (Ajv, como `ValidadorEsquemaAjv` de parámetros); entidad solo en el modelo de dominio.
3. ¿Lectura pública con o sin RLS? Recomendación: resolver `host -> tenant` con función `SECURITY DEFINER` mínima, luego fijar `app.tenant_id` y leer con RLS normal (doble barrera intacta). Caché Redis por `(host, slug, version)` + ETag.
4. ¿Un permiso o dos (editar/publicar)? Recomendación: mantener `plat.cms.pagina` del SRS en R3; separar `publicar` solo si un producto pide aprobación.
5. ¿Programar páginas (T-08 `publicarEn`)? Recomendación: fuera; solo noticias se programan (RF-122).
6. ¿Vista previa? Recomendación: la vista previa usa `cms-render` dentro del editor (mismo componente, ancho 390/1280 px), sin SSR ni token de vista previa.
7. ¿Bloque dinámico en R3? Recomendación: dejar el puerto y un bloque dinámico de ejemplo de plataforma (p. ej. "sucursales") para probar TR-CA-294; el de cada producto llega con su producto.
8. ¿Purga del CDN? Recomendación: por etiqueta de caché `sitio:<id>` (purga todo el sitio al publicar, simple y dentro de 60 s); verificar con la doc vigente de Vercel al redactar el spec.
