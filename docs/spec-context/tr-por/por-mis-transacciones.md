# Contexto para por-mis-transacciones

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF 128, 061, 062, 040, Criterios GWT, RNF, Componentes, Consumidores, Trazabilidad), `plan.md` (backlog R2/R3, R4), `3_plan.json`, PL-10, A-05, T-08, código real del repo.

## 1. Alcance y dependencias
- **Sin historia en el plan.** RF-128 tiene fase SRS "R2" (Should), pero R3-07 lista solo RF 125, 126, 127, 129 y ningún ítem de `3_plan.json` cita RF-128. Según la regla "si el SRS y el plan chocan, manda el plan", RF-128 queda fuera de R0-R3 hasta que se le asigne historia (ver P1).
- PL-10: `PER --> POR`; RF-128 cita TR-FE (comprobantes, R2) y TR-PER; el encargo añade TR-PAG (R3, pagos en línea), que el SRS no lista para 128 pero aplica si "compras" incluye pagos en línea.
- Dependencias reales: H1 y H2 de TR-POR (cuenta de cliente, guard, `portal-cuenta`); TR-PER (rol de persona por producto, RF-040: el shell consulta "a cada producto en el que tiene rol"); TR-FE (R2-06 PDF, RF-062 entrega y consulta pública de comprobante); al menos un producto que aporte su contribución (PsicoAgenda: citas; SazónPOS: compras/pedidos, en otro repo).
- Partición propuesta (cuando tenga historia; estimación 7 h):

| Parte | Slug | Alcance | h | Depende de |
|---|---|---|---|---|
| J | por-mis-transacciones | Contrato de contribución por producto, agregación en el portal, página «Mis movimientos», descarga de comprobante vía TR-FE | 7 | H1, H2, TR-PER (RF-040), TR-FE (R2-06, RF-062), un producto contribuyente |

- Áreas: (a) contrato `ContribucionPortal` (back: puerto de lectura por producto; front: token de inyección para vistas propias); (b) agregación ordenada por fecha con degradación si un producto no responde; (c) página y descarga de comprobante con URL firmada.
- Fuera de alcance: detalle de cada transacción (lo da el producto); pagar desde el portal (TR-PAG, RF-068 link de pago); "mis autorizaciones" (RF-051, R4); historial entre tenants (prohibido, TR-CA-312).
- Constitución: reglas 1-11 (regla 7: `scope:plataforma` no importa de productos: la contribución entra por puerto o token de inyección, nunca por import); estructura de libs Angular; verificación Playwright; DoD.

## 2. RF
| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-128 | Consultar mis transacciones | publico.portal.transacciones | APP-05 | TR-RN-001 | TR-RNF-002, 004 | Cliente final / titular de datos |

Should, fase SRS R2, módulo MOD-19, procesos TR-P07 y TR-P04, IA No.
- Precondición: sesión iniciada y rol en al menos un producto.
- Flujo: 1) abre «Mis movimientos»; 2) el shell pide a cada producto en el que tiene rol su lista resumida; 3) lista ordenada por fecha con estado y enlace al detalle del producto; 4) desde una compra descarga su comprobante electrónico.
- Datos: `producto`; `tipo` (COMPRA|CITA|MEMBRESIA|PEDIDO|TRAMITE); `fecha`; `descripcion`; `estado`; `monto`; `comprobante` (serie-número).
- Salida: historial del cliente en un solo lugar. Componentes: TR-POR, TR-FE, TR-PER.
- Hoja Consumidores (TR-POR): "cada producto aporta sus vistas (mis citas, mis pedidos, mis trámites)". Hoja Componentes: "mis transacciones (contribuciones por producto)".

## 3. Criterios GWT
- **TR-CA-311** (Positivo, "Cliente con citas y compras"): Juana con 3 citas en CLI y 2 compras en la farmacia del mismo tenant -> ve las 5 ordenadas por fecha.
- **TR-CA-312** (Negativo, "Transacciones de otro tenant"): Juana también es cliente de otro negocio de la plataforma -> en el portal del primer tenant solo ve las de ese tenant.

Estado: Pendiente. Faltan (proponer): un producto no responde (se muestran los demás con aviso, sin error total); descarga de comprobante de otra persona por serie-número manipulado -> 404; paginación o tope de periodo (TR-RNF-002); cliente sin rol en ningún producto -> estado vacío; Core Web Vitals de la página (TR-RNF-004).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-001 | Toda entidad lleva `tenant_id`; ninguna consulta cruza tenants (base de TR-CA-312). |
| TR-RNF-002 | Consultas y listados paginados p95 < 1,5 s con hasta 100 000 registros por tenant. |
| TR-RNF-004 | Core Web Vitals móvil (LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1). |
| TR-RNF-010 | Aislamiento por tenant, doble barrera. |
| TR-RNF-019 | WCAG 2.1 AA (heredado del portal). |
| TR-RNF-024 / 119 | Límites de módulos: la plataforma no importa de productos. |

Heredados por CLAUDE.md: 001, 003, 008, 011, 012, 013/112, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
Sin historia. Ninguna entrada de `backlog` cita TR-RF-128. Relacionadas: R3-07 (portal, sprint 22, 10 h), R2-06 (TR-FE representación impresa, sprint 14, 4 h), R2-09 (entrega del comprobante, RF-062), R2-01 (rol de persona por producto, RF-040), R3-01/R3-03 (pagos en línea y link de pago).

## 6. Tablas SQL, eventos, puertos y permisos
- **Tablas**: ninguna en la propuesta federada (cada producto es dueño de sus transacciones). Alternativa proyectada (ver P2): `por.movimiento` (tenant_id, persona_id, producto_codigo, tipo, referencia_externa, fecha, descripcion, estado, monto, comprobante_id; UNIQUE `(tenant_id, producto_codigo, referencia_externa)`) alimentada por eventos de producto y por `cpe.aceptado` de TR-FE. RLS por tenant; REVOKE a `anon, authenticated`.
- **Eventos**: consumidos (alternativa proyectada): eventos de producto por definir (sin RF) y `cpe.aceptado` (RF-062). Consumidores idempotentes por `event_id` (regla 4).
- **Puertos**: `ContribucionPortal` (por producto: `listarResumen(personaId, desde, hasta)` -> filas con el formato del RF), `RolesPersonaPort` (TR-PER, productos en que tiene rol), `ComprobantesPort` (TR-FE: URL firmada del PDF de un comprobante cuyo adquirente es la persona), registro de contribuciones en el módulo Nest (`PortalModule.registrarContribucion(...)`) y en Angular (`CONTRIBUCIONES_PORTAL`, multi-provider).
- **Permisos**: `publico.portal.transacciones` (SRS), mismo mecanismo de portal que H1. Endpoint propuesto `GET /v1/portal/movimientos?desde=&hasta=&pagina=`.

## 7. Código base relacionado
- **Existe**: `org` (`PRODUCTOS`: REST, PSI, COL, LIB, GYM, CLI, DOC, ECO, LEX), `eventos` (`SuscribirEvento` para la alternativa proyectada), `kernel` (`TenantContext`), `shared/ui` (patrón de tabla y estado vacío, aunque el portal usa la marca del sitio), patrón de multi-provider: `VERIFICADORES_REFERENCIAS` de catálogos (spec 19a) para registrar implementaciones por consumidor sin importar productos.
- **Falta**: TR-POR H1/H2, TR-PER, TR-FE, cualquier producto contribuyente dentro del monorepo (no hay apps de producto).

## 8. Diagramas relevantes
- `.../1_Arquitectura/A-05_Frontend_de_PsicoAgenda_aplicaciones_y_librerias.mmd` (`psi/feature-portal` en `psi-web` junto a `portal-cuenta`: contribución del producto).
- `.../1_Arquitectura/A-08_Reglas_de_dependencia_entre_proyectos_del_monorepo.mmd` (por qué la plataforma no importa del producto).
- `.../2_Plataforma_Transversal/T-06_Modelo_de_dominio_Comprobantes_electronicos_y_pagos.mmd`.
- `.../2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (rol por producto).
- `1_Mermaid/PL-10_...mmd`.

## 9. Ambigüedades y preguntas candidatas
Ambigüedades:
- Fase R2 en el SRS, sin historia en el plan y con dependencias de R3 (portal): no tiene sprint.
- "El shell solicita a cada producto": no dice si es en el navegador (cada producto expone su API) o en la API de plataforma (federación en el servidor).
- `tipo` incluye TRAMITE y MEMBRESIA de productos que no existen todavía.
- TR-PAG no figura en el RF, pero las compras con pago en línea serían "compras".

Preguntas, con recomendación:
1. ¿Entra en R3? Recomendación: no; registrar en `docs/roadmap-specs.md` como pendiente sin historia y especificarlo cuando PsicoAgenda (primer producto con portal) lo pida. El portal R3 sale sin «Mis movimientos».
2. ¿Federado o proyectado? Recomendación: federado en el navegador para R3+ (cada `<cod>-web` registra su contribución Angular, que llama a su propia API); la plataforma solo da el contenedor, el orden y la descarga de comprobante. Proyección en `por.movimiento` solo si se mide que la federación no cumple TR-RNF-002.
3. ¿Descarga del comprobante? Recomendación: por TR-FE (`ComprobantesPort`) verificando que el adquirente es la persona de la cuenta; URL firmada de 15 min (TR-RN-027).
4. ¿Producto caído? Recomendación: tiempo máximo por contribución (2 s), mostrar lo disponible y un aviso por producto; nunca fallar la página.
5. ¿Ventana de tiempo? Recomendación: últimos 12 meses por defecto, paginado por producto.
