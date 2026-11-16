# Contexto para cms-medios-noticias-formularios

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes), `plan.md` (backlog R2/R3), `3_plan.json`, PL-10, T-08, A-05, A-06, `specs/18b-*.md`, `specs/19a-*.md`, código real del repo.

## 1. Alcance y dependencias
- Historia R3-06 (sprint 22, R3, 8 h, Full): "Menús, banners, galería, noticias y formularios de contacto" (RF 121, 122, 124). Comparte sprint 22 con R3-07 (portal, 10 h): 18/20 h.
- PL-10: `ARC --> CMS`. Dependencias reales por RF: 121 -> TR-ARC (R2-03) + procesamiento de imágenes; 122 -> TR-CAT (catálogo propio de categorías, spec 19a, ya existe) + worker programado; 124 -> TR-PER (R2-01, crear o vincular persona y consentimiento) + TR-NOT (R2-09, correo al tenant). Todas requieren el sitio (parte A) y el render (parte C) de R3-05.
- Partición propuesta (8 h del plan no alcanzan; estimación realista 17 h):

| Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|
| E | cms-menus-banners-galeria | 121 | 6 | A, C, TR-ARC (R2-03) |
| F | cms-noticias-programadas | 122 | 5 | B, C, 19a (catálogo propio), worker |
| G | cms-formularios-contacto | 124 | 6 | C, TR-PER (R2-01), TR-NOT (R2-09) |

- Áreas de E: (a) `Menu` (ítems con padre, destino página o URL) y `Banner` con vigencia; (b) `Medio` con variantes WebP 480/960/1920 en el worker y texto alternativo obligatorio; (c) pantallas de admin y bloques de render.
- Áreas de F: (a) agregado `Articulo` con estados y `publicar_en`; (b) tarea BullMQ diferida que publica e invalida caché; (c) listado, detalle y feed RSS en el render.
- Áreas de G: (a) definición de formulario por código y registro del envío; (b) anti-spam, límite por IP, consentimiento; (c) creación o vínculo de persona y notificación al tenant.
- Fuera de alcance: reclamos (libro de reclamaciones es del producto: el SRS dice "reclamo derivado al producto"), constructor visual de formularios, comentarios en noticias, newsletter, WhatsApp (R3-11).
- Constitución: reglas 1-11; estructura de libs Angular; Diseño UI (solo admin); verificación Playwright; DoD.

## 2. RF
Módulo MOD-18, proceso TR-P07 (124 también TR-P06), IA No.
| ID | Nombre | Permiso | App | RN | RNF | Actor | Prior. |
|---|---|---|---|---|---|---|---|
| TR-RF-121 | Gestionar menús, banners y galería | plat.cms.medios | APP-02 | TR-RN-027, 042 | TR-RNF-004, 019 | Editor de contenidos web | Should |
| TR-RF-122 | Publicar noticias con programación | plat.cms.noticia | APP-02 | TR-RN-042 | TR-RNF-123, 004 | Editor de contenidos web, Planificador de tareas | Should |
| TR-RF-124 | Recibir formularios de contacto | publico.cms.formulario | APP-05 | TR-RN-043, 030, 025 | TR-RNF-015, 016, 019 | Cliente final / titular de datos, Administrador del cliente | Must |

Fase SRS: MVP (plan R3).
- **121**: menú (texto 1-40, destino página o URL, orden, padre); banner (imagen, título 0-80, enlace, `vigente_desde`, `vigente_hasta`); galería (imágenes con texto alternativo obligatorio). Variantes WebP 480, 960, 1920 px. Publicar invalida caché. Componentes: TR-CMS, TR-ARC.
- **122**: `titulo` (5-150), `slug`, `resumen` (20-300), `contenido` (texto enriquecido), `categoria` (catálogo propio del tenant), `imagen_destacada`, `publicar_en` (fecha-hora futura opcional, America/Lima). El planificador publica a la hora e invalida caché; aparece en listado y feed RSS. Componentes: TR-CMS, TR-ARC, TR-CAT.
- **124**: precondición: formulario publicado en una página. Campos: `formulario` (código); nombre (3-100), correo, celular (9 dígitos), mensaje (10-2000); `acepta_privacidad` (obligatorio); `consentimiento_promociones` (opcional); `desafio_antispam` (token). Flujo: valida campos, desafío y límite por IP; registra; crea o vincula persona si dio consentimiento; notifica al correo configurado; confirma al visitante. Tipos: contacto, cotización, reclamo derivado al producto. Componentes: TR-CMS, TR-PER, TR-NOT.

## 3. Criterios GWT
- **TR-CA-295** (121, Positivo): banner «Verano 2027» vigente del 01/12/2026 al 28/02/2027 -> aparece solo en ese rango.
- **TR-CA-296** (121, Negativo): foto de galería sin texto alternativo -> se exige antes de publicar.
- **TR-CA-297** (122, Positivo): noticia programada para el 15/10/2026 08:00 -> se publica a esa hora y aparece primera en el listado.
- **TR-CA-298** (122, Negativo): a las 10:00 se programa para las 09:00 del mismo día -> «La fecha de publicación debe ser futura» y ofrece publicar ahora.
- **TR-CA-301** (124, Positivo): «Cotiza tu caso» con celular 987654321 y política aceptada -> envío registrado y correo al estudio.
- **TR-CA-302** (124, Negativo): sin marcar la política -> no se registra y se resalta la casilla.
- **TR-CA-303** (124, Borde): 5 envíos desde una IP en 10 min -> el sexto: «Demasiados envíos; intente más tarde».

Estado: Pendiente. Faltan (proponer): imagen > 10 MB o MIME no permitido (TR-RN-027); variantes WebP generadas; submenú con más de un nivel (definir profundidad máxima); noticia programada cancelada antes de la hora; feed RSS válido; desafío anti-spam inválido; persona creada solo con consentimiento; correo del formulario no llega a logs (TR-RNF-026); banner vencido desaparece sin publicar de nuevo (caché, ver P4).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-027 | MIME permitido por categoría, imágenes <= 10 MB, SHA-256, antivirus, URL firmada <= 15 min. |
| TR-RN-042 | Slug único por sitio; programados en hora de America/Lima. |
| TR-RN-043 | Registro exige aceptar la política vigente (aplica a 124 por la aceptación obligatoria); OTP 6 dígitos, 5 min, 3 intentos, reenvío 60 s. |
| TR-RN-030 | Consentimiento libre, previo, expreso, informado, por finalidad separada; versión del texto, fecha, canal; revocable. |
| TR-RN-025 | Promocionales solo con consentimiento vigente y entre 8:00 y 20:00 de Lima. |
| TR-RNF-015 | Límite de tasa por IP en endpoints públicos (429). |
| TR-RNF-016 | Ley 29733 y D.S. 016-2024-JUS. |
| TR-RNF-019 | WCAG 2.1 AA (texto alternativo obligatorio es parte). |
| TR-RNF-004 / 123 | Core Web Vitals (imágenes responsivas WebP); SSR con caché y <= 60 s. |

Heredados por CLAUDE.md: 001/002/003, 008, 010, 011, 012, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | Historia | RF | Tipo | Release |
|---|---|---|---|---|---|---|---|
| R3-06 | 22 | 8 | TR-CMS | Menús, banners, galería, noticias y formularios de contacto | TR-RF-121, 122, 124 | Full | R3 |

Relacionadas: R3-05 (sitio, páginas, render), R2-01 (personas y consentimientos, RF-043), R2-03 (archivos, RF 080-082), R2-09 (correo, RF 074/075), R3-07 (portal). Sprint 22: 23/08/2027-05/09/2027 (feriado Santa Rosa 30/08).

## 6. Tablas SQL, eventos, puertos y permisos
- **Tablas** (`db/01<letra>_cms_medios.sql` o dentro de la migración de CMS): `cms.menu` (sitio_id, ubicacion, items jsonb validado; T-08 lo modela así); `cms.banner` (sitio_id, archivo_id, titulo, enlace, vigente_desde, vigente_hasta, orden); `cms.medio` (sitio_id, archivo_id, texto_alternativo NOT NULL, variantes jsonb, estado PROCESANDO|LISTO|ERROR); `cms.articulo` (sitio_id, slug UNIQUE por sitio, titulo, resumen, contenido, categoria_item_id, imagen_archivo_id, estado BORRADOR|PROGRAMADA|PUBLICADA|DESPUBLICADA, publicar_en timestamptz, publicada_en, version); `cms.formulario` (sitio_id, codigo, tipo CONTACTO|COTIZACION|RECLAMO, correo_destino, activo); `cms.envio_formulario` (formulario_id, datos jsonb cifrado o con retención, persona_id null, ip_hash, recibido_en, estado_notificacion). Todas con tenant_id, RLS y REVOKE a `anon, authenticated`.
- **Eventos**: SRS no define eventos propios para 121/122/124. Propuestos: `cms.articulo.publicado` (reusa la purga), `cms.formulario.recibido` (consumido por TR-NOT para avisar al tenant). TR-PER publica `persona.registrada` y consentimiento (RF-043); no los publica CMS.
- **Puertos**: `ArchivosPort` (TR-ARC), `ProcesadorImagenes` (variantes WebP; adaptador `sharp` en el worker), `PlanificadorPublicacion` (BullMQ con retardo; o barrido periódico, ver P2), `VerificadorAntispam` (adaptador Cloudflare Turnstile o hCaptcha; nulo en pruebas), `ContadorEnvios` (Redis, mismo patrón que `ContadorIntentos` de 18b), `PersonasPort` (TR-PER: buscar o crear, registrar consentimiento), `NotificacionesPort` (TR-NOT, correo con plantilla).
- **Permisos** (SRS): `plat.cms.medios`, `plat.cms.noticia`; `publico.cms.formulario` es de visitante anónimo: endpoint `POST /v1/cms/publico/formularios/:codigo/envios` con `@Publico` y límite de tasa. El prefijo `publico.` no existe hoy en el manifiesto (ver paquete POR, P4).
- **Catálogo de categorías**: catálogo `CATEGORIA_NOTICIA` de alcance TENANT en TR-CAT (spec 19a), validado con `CatalogoPort.validarItem`.

## 7. Código base relacionado
- **Existe**: `catalogos` (`CATALOGO_PORT`, `CatalogoPort.validarItem`), `apps/worker` (BullMQ; patrón `abrirColaImportaciones` de catálogos para una cola nueva), `seguridad` (Redis y `ContadorIntentos` del ingreso, spec 18b; `Publico`), `kernel-infra` (`OutboxPublisher`, `SystemClock`), `org` (`fechaCalendarioDe`, `ZONA_VENCIMIENTOS` para America/Lima; commits recientes fijan "fecha de Perú"), `auditoria` (`@Auditable`), `shared/ui` (tabla, panel lateral, chips de estado para PROGRAMADA/PUBLICADA).
- **Falta**: TR-ARC, TR-PER, TR-NOT (R2, no implementados en este repo al 16/11/2026); procesamiento de imágenes; anti-spam; todo el esquema `cms`.

## 8. Diagramas relevantes
- `.../2_Plataforma_Transversal/T-08_Modelo_de_dominio_Contenidos_web_CMS_y_portal_del_cliente.mmd` (Menu, Articulo, Medio).
- `.../2_Plataforma_Transversal/T-07_Modelo_de_dominio_Notificaciones_archivos_auditoria_y_eventos.mmd` (archivos y notificaciones que consume).
- `.../2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (persona y consentimiento del formulario).
- `.../2_Plataforma_Transversal/T-S6_...render_SSR_del_sitio.mmd`; `1_Mermaid/PL-10_...mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- RF-124 mezcla CMS con TR-PER y TR-NOT; si R2 se atrasa, G no puede cerrar.
- "Reclamo derivado al producto" no tiene contrato; el Libro de Reclamaciones (Indecopi) tiene reglas propias.
- Los banners con vigencia cambian sin publicar: la caché del CDN no se purga sola en la fecha de inicio o fin.
- RF-124 usa `publico.cms.formulario` en APP-05 (portal), pero el formulario lo envía un visitante anónimo, no un cliente con sesión.
- Datos del envío (nombre, correo, celular, mensaje) son personales: retención no definida.

Preguntas, con recomendación:
1. ¿Se parte R3-06? Recomendación: sí, E (6), F (5), G (6); G al final porque depende de PER y NOT.
2. ¿Publicación programada cómo? Recomendación: trabajo BullMQ con `delay` hasta `publicar_en` + barrido cada minuto como red de seguridad (idempotente por versión); hora en America/Lima convertida a `timestamptz`.
3. ¿Variantes de imagen dónde? Recomendación: en el worker con `sharp`, al recibir `archivo.subido` de TR-ARC; no publicar hasta `LISTO`.
4. ¿Vigencia de banners y caché? Recomendación: el render filtra por fecha y el HTML se cachea con TTL corto (10 min) o se agenda una purga en `vigente_desde` y `vigente_hasta` con la misma cola de F.
5. ¿Anti-spam? Recomendación: Cloudflare Turnstile detrás de `VerificadorAntispam` + límite 5 por IP en 10 min en Redis (TR-CA-303) + campo trampa.
6. ¿Persona siempre o solo con consentimiento? Recomendación: el envío se guarda siempre (base: atender la solicitud); la persona se crea o vincula solo si marca `consentimiento_promociones` o el tipo lo exige (cotización), registrando el consentimiento en TR-PER con versión y canal WEB.
7. ¿Retención de envíos? Recomendación: 12 meses, parámetro TR-CFG `cms.retencion_envios_meses`; purga en el worker.
8. ¿Reclamos? Recomendación: fuera de R3; el formulario tipo RECLAMO solo emite `cms.formulario.recibido` para que el producto lo tome.
9. ¿Profundidad del menú? Recomendación: dos niveles (menú y submenú), sin más anidación.
