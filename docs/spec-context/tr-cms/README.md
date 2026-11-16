# TR-CMS · Gestor de contenidos web (MOD-18)

Paquetes de contexto para `/spec`. Release R3 (plan: sprints 21 y 22, historias R3-05 y R3-06). Primer consumidor real: PsicoAgenda (`psi-web`).

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-119 | Configurar sitio público y dominio | Must | MVP | R3-05 | `cms-sitio-dominio-seo.md` | Contexto listo |
| TR-RF-120 | Gestionar páginas por bloques | Must | MVP | R3-05 | `cms-paginas-bloques-render.md` | Contexto listo |
| TR-RF-121 | Gestionar menús, banners y galería | Should | MVP | R3-06 | `cms-medios-noticias-formularios.md` | Contexto listo |
| TR-RF-122 | Publicar noticias con programación | Should | MVP | R3-06 | `cms-medios-noticias-formularios.md` | Contexto listo |
| TR-RF-123 | Configurar SEO del sitio y páginas | Should | MVP | R3-05 | `cms-sitio-dominio-seo.md` | Contexto listo |
| TR-RF-124 | Recibir formularios de contacto | Must | MVP | R3-06 | `cms-medios-noticias-formularios.md` | Contexto listo |

Fase SRS "MVP" en todos; manda el plan: R3. Ningún spec redactado ni implementado.

## Orden de construcción
Requisitos previos fuera de este componente: specs 07, 11, 15, 19a (implementados) y TR-ARC (R2-03); para G, TR-PER (R2-01) y TR-NOT (R2-09).

| Orden | Parte | Slug | RF | h | Depende de |
|---|---|---|---|---|---|
| 1 | A | cms-sitio-dominio-marca | 119 | 8 | 07, 11, 15, TR-ARC |
| 2 | B | cms-paginas-bloques | 120 (back + editor) | 9 | A |
| 3 | C | cms-render-ssr | 120 (render, CDN) | 8 | B |
| 4 | D | cms-seo-sitemap | 123 | 4 | B, C |
| 5 | E | cms-menus-banners-galeria | 121 | 6 | A, C, TR-ARC |
| 6 | F | cms-noticias-programadas | 122 | 5 | B, C, 19a |
| 7 | G | cms-formularios-contacto | 124 | 6 | C, TR-PER, TR-NOT |

- D, E y F pueden ir en paralelo tras C. G es la última.
- Total estimado 46 h frente a 24 h del plan (R3-05 16 + R3-06 8). Hay que replanificar sprints 21-22.
- TR-POR (`../tr-por/`) depende de A (resolución de tenant por host) y de C (app SSR donde se monta `portal-cuenta`).

## Decisiones transversales pendientes (se repiten en los paquetes)
- Dónde vive la app SSR de referencia (`apps/plataforma-web` propuesta).
- Marca del sitio público por tenant frente a Diseño UI de CLAUDE.md (que aplica solo al admin).
- Proveedor de dominios, TLS y purga de CDN (Vercel, según A-09).
- Nombre de eventos (`cms.pagina.publicada` de T-S6 frente a `cms.pagina_publicada` del SRS).
