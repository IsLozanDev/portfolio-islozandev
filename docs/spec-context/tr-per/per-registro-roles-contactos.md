# Contexto para per-registro-roles-contactos

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (hojas RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores, Matriz Proceso-RF), `3_plan.json` (R2-01), plan (sec. 5, 6.1, 7), diagramas T-05, OP-04, OP-05, PL-10, código real en `libs/`. Ruta de planes: `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/` (P). Diagramas de diseño: `01-analysis/component-transversal/Vitrina_Productos_Todos_los_Mermaid/` (D).

## 1. Alcance y dependencias
- Historia R2-01 (sprint 13, 7 h, Back, R2): "Personas: registro con documento, rol por producto, contactos, direcciones y consentimientos" (RF 039, 040, 041, 043). Este paquete cubre 039, 040, 041 y el componente `<ui-persona-buscador>`; 043 va en `per-consentimientos.md`.
- Lib nueva `libs/plataforma/personas` (árbol del plan: `personas/ (R2) TR-PER`), tags `scope:plataforma`, `type:backend`, `comp:per` (spec 01 dejó los `comp:*` de R2 para cuando nazca la lib). Esquema `per`.
- PL-10: `CAT --> PER --> IDN`; `SEQ & CAT & PER --> FE`; `PER --> POR`. PER usa CAT (TIPO_DOC_IDENTIDAD, UBIGEO) y ORG (suscripción del producto). RF-039 consume TR-IDN para prellenar: dependencia real inversa a la flecha de PL-10 (ver P1).
- Horas: el plan da 7 h a cuatro RF solo de back. Con la capa HTTP (lección de 16/17: el plan no contaba controladores) y la UI, no cabe. Partición propuesta:

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | per-registro-y-roles | 039, 040 | 9 | (a) DDL `per` + dominio `Persona`, `DocumentoIdentidad`; (b) casos de uso registrar, buscar, asignar rol + `PersonaPort` + eventos; (c) HTTP `/v1/personas` | 07, 19a, 17a (suscripciones), idn-validacion-consulta (o puerto nulo, P1) |
| B | per-contactos-direcciones | 041 | 5 | (a) DDL contacto/dirección; (b) casos de uso con principal por tipo + evento; (c) HTTP | A |
| C | per-ui-persona-buscador | UI de 039 y 041 | 8 | (a) lib `personas-ui` con `<ui-persona-buscador>`; (b) alta rápida en panel lateral con prellenado IDN; (c) contactos y direcciones en la ficha | A, B, 15/15b/15c/15d, 13 |

- Fuera de alcance: consentimientos (043, otro paquete), fusión de duplicados (042, Should/R2, R2-12), identidad portable (048-051, R4), relaciones apoderado/tutor del T-05 (sin RF), datos de PersonaNatural del T-05 no pedidos por RF-039 (`fechaNacimiento`, `sexo`), integración SazónPOS CC-06 (R2-12), portal del titular (TR-POR, R3).
- Constitución aplicable: reglas 1-8, 10, 11 (TypeORM; spec nuevo), código limpio, estructura de libs Angular (C), diseño UI (C); DoD completo.

## 2. RF
Módulo MOD-06 (TR-PER), proceso TR-P10, fase MVP en SRS, R2 en el plan.

| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-039 | Registrar persona con documento | plat.persona.registrar | APP-03 | TR-RN-002, 031 | TR-RNF-001, 010 | Módulo de producto, usuario operativo |
| TR-RF-040 | Asignar rol de persona por producto | plat.persona.rol | APP-03 | TR-RN-001, 006 | TR-RNF-010, 024 | Módulo de producto |
| TR-RF-041 | Gestionar contactos y direcciones | plat.persona.editar | APP-03 | TR-RN-001 | TR-RNF-012, 018 | Usuario operativo, módulo de producto |

- **039** Must. Precondición: permiso del producto para registrar clientes/pacientes/socios. Flujo: tipo y número -> valida con atributos de TIPO_DOC_IDENTIDAD (CAT) y busca en el tenant -> si no existe y es DNI o RUC consulta TR-IDN y prellena -> completa contacto -> crea y publica `persona.registrada`. Datos: `tipo_persona` (NATURAL|JURIDICA), `tipo_documento` (catálogo), `numero`, nombres y dos apellidos (natural), `razon_social` (jurídica), `celular` (9 dígitos, inicia con 9), `correo` opcional. Salida: persona única por documento en el tenant. Componentes: TR-PER, TR-IDN, TR-CAT, TR-EVT.
- **040** Must. Precondición: la persona existe. Flujo: el producto pide el rol -> verifica producto suscrito -> registra rol con producto y fecha -> los datos maestros se ven en todos los productos del tenant (nivel 2, OP-04/OP-05). Datos: `persona_id`, `producto_codigo` (5), `rol` (CLIENTE|PACIENTE|SOCIO|ADMINISTRADO|CONTRAPARTE|PROVEEDOR), `desde`. Componentes: TR-PER, TR-ORG.
- **041** Must. Precondición: la persona existe. Flujo: agrega o edita -> valida (celular 9 dígitos con 9, correo RFC 5322, ubigeo vigente) -> si es principal desmarca el anterior del mismo tipo -> guarda y publica `persona.actualizada`. Datos: `tipo_contacto` (CELULAR|FIJO|CORREO|WHATSAPP), `valor`, `principal`, `direccion` (5-250), `referencia` (0-150), `ubigeo` (6 dígitos). Componentes: TR-PER, TR-CAT, TR-EVT.
- Interfaz (hoja Componentes, 15 RF usan TR-PER): `PersonaPort` (buscar, registrar, asignarRol, consentimientos); eventos `persona.registrada`, `persona.actualizada`, `persona.fusionada`, `consentimiento.revocado`; componente `<ui-persona-buscador>`. Hoja Consumidores: 9 sistemas (REST, PSI, COL, LIB, GYM, CLI, DOC, ECO consumen o extienden; "cada producto guarda solo persona_id").

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-100 | 039 | Positivo | DNI 45781236 nuevo: prellena «Juana Quispe Mamani» desde TR-IDN y crea la persona |
| TR-CA-101 | 039 | Negativo | DNI ya registrado: muestra la persona existente en vez de duplicar |
| TR-CA-102 | 039 | Borde | CE 001234567 no se consulta en IDN: nombres a mano y crea |
| TR-CA-103 | 040 | Positivo | Juana PACIENTE en CLI pasa a SOCIO en GYM del mismo tenant: una ficha, dos roles |
| TR-CA-104 | 040 | Negativo | Tenant sin ECO: rol CLIENTE de ECO rechazado con «Producto no suscrito» |
| TR-CA-105 | 041 | Positivo | Dirección «Av. Ejército 710» con ubigeo 040103: principal, Cayma / Arequipa / Arequipa |
| TR-CA-106 | 041 | Negativo | Celular 51987654: «El celular debe tener 9 dígitos e iniciar con 9» |

Estado SRS: Pendiente. Faltan y se proponen: aislamiento (persona de otro tenant -> 404, TR-RNF-010); IDN caído o `CUOTA_AGOTADA` -> registro manual sin bloquear (TR-RNF-007); segundo principal del mismo tipo desmarca el anterior (041 paso 3); ubigeo no vigente rechazado; RUC con `tipo_persona` NATURAL incoherente; UI: buscador en tema claro y oscuro y a 600 px.

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-001 | Toda entidad lleva `tenant_id`; ninguna consulta cruza tenants. |
| TR-RN-002 | RUC 11 dígitos, prefijo 10/15/17/20, módulo 11; DNI 8 dígitos. |
| TR-RN-006 | Producto sin suscripción vigente (ACTIVA o PRUEBA) no otorga permisos (base de TR-CA-104). |
| TR-RN-031 | Validar formato antes de consultar al proveedor; caché, bitácora con hash, cuota (lo aplica IDN). |
| TR-RNF-001 | Operaciones de mostrador p95 < 800 ms (registro con consulta IDN incluida: ver P5). |
| TR-RNF-010 | Doble barrera tenant (contexto + RLS), 0 accesos cruzados. |
| TR-RNF-012 | OWASP ASVS 2, validación en servidor. |
| TR-RNF-018 | UI responsiva >= 360 px en español de Perú. |
| TR-RNF-024 | Monolito modular, límites Nx. |

Heredados por CLAUDE.md: 002, 003, 008, 011, 013/112, 025, 026 (sin datos personales en logs: aquí aplica de lleno), 101, 106, 119. TR-RNF-111 (documento hasheado en logs) también aplica a los logs de PER.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | RF | Tipo | Release |
|---|---|---|---|---|---|---|
| R2-01 | 13 | 7 | TR-PER | TR-RF-039, 040, 041, 043 | Back | R2 |

Relacionadas: R2-02 (TR-IDN, sprint 13, 7 h), R2-03 (TR-ARC, sprint 13, 6 h), R2-12 (SazónPOS CC-06 + RF-042, sprint 16, 8 h), R2-05 (FE boleta/factura usa la persona adquirente). Sprint 13: 2027-04-19 a 2027-05-02, objetivo "Personas, identidad DNI/RUC y archivos", 20/20 h. No hay historia front para `<ui-persona-buscador>` (plan 6.1 R2 no lista pantallas de personas).

## 6. Tablas SQL, eventos, puertos y permisos
- Migraciones: R1 terminó en `db/01i_*`; se sigue con una letra por esquema (FE ya asume `01m`): `db/01j_per.sql` (+ `rollback/` y `tests/01j_per.test.sql`); contactos en `db/01j_per_contactos.sql` si B va aparte.
- Tablas propuestas (no hay DDL en `codigo/`; T-05 da el modelo):
  - `per.persona`: `id`, `tenant_id`, `tipo_persona`, `tipo_documento`, `numero_documento`, `nombres`, `apellido_paterno`, `apellido_materno`, `razon_social`, `documento_verificado` (T-05), `fuente_verificacion` (CACHE|PROVEEDOR|MANUAL), `activo`, `version`, `creado_en`, `actualizado_en`. Único parcial `(tenant_id, tipo_documento, numero_documento)`. CHECK natural/jurídica.
  - `per.persona_rol`: `persona_id`, `tenant_id`, `producto_codigo`, `rol`, `desde`, `hasta` nulo; único `(persona_id, producto_codigo, rol)`.
  - `per.contacto`: `id`, `persona_id`, `tenant_id`, `tipo_contacto`, `valor`, `principal`, `verificado`; único parcial `(persona_id, tipo_contacto) WHERE principal`.
  - `per.direccion`: `id`, `persona_id`, `tenant_id`, `direccion`, `referencia`, `ubigeo`, `principal`; único parcial de principal por persona.
  - RLS por `app.tenant_id` (patrón `01a_org.sql`); REVOKE a `anon, authenticated` en `per` (regla 8; patrón `supabase/migrations/20261102000000_seg_supabase_auth.sql`).
- Eventos (SRS): `persona.registrada`, `persona.actualizada`. Sin evento en el SRS para la asignación de rol: proponer `persona.rol_asignado` o usar `persona.actualizada` (P4). Esquemas en `infrastructure/event-schemas.ts` como `registrarEsquemasCat`.
- Puertos: provee `PersonaPort` (`buscar(tipo, numero)`, `registrar`, `asignarRol`) con símbolo de inyección como `CATALOGO_PORT`. Consume `CatalogoPort.validarItem` (TIPO_DOC_IDENTIDAD, UBIGEO), `IdentidadPort.consultar` de TR-IDN (o nulo), lectura de suscripciones de ORG (`RepositorioSuscripciones`/`Suscripcion`, estados `PRUEBA|ACTIVA`).
- Alcance de la persona (`Componentes_Transversales_Plataforma.docx` 3.4 y 3.5): la persona es del tenant y se comparte entre sus empresas, nunca entre tenants (Ley 29733). Sin `empresa_id` en `per.persona`.
- Catálogos del documento de análisis (5.1) que PER usa y que no existen en `db/01f_cat.sql`: `SEXO` (global de plataforma; PSI, GYM, CLI) y `ESTADO_CIVIL` (global, RENIEC como referencia; PSI, CLI, LEX). Hay que sembrarlos (P10).
- Registrar un `VerificadorReferencias` de CAT (`VERIFICADORES_REFERENCIAS`) para UBIGEO y TIPO_DOC_IDENTIDAD: cierra el pendiente de TR-CA-074 (distrito referenciado por personas).
- Permisos (SRS): `plat.persona.registrar`, `plat.persona.rol`, `plat.persona.editar`. Sin código para buscar/leer: proponer `plat.persona.leer` (no está en el SRS). Alta en `libs/plataforma/seguridad/manifiesto/plat.manifiesto.json`.
- Endpoints propuestos: `GET /v1/personas?tipo&numero`, `POST /v1/personas`, `POST /v1/personas/{id}/roles`, `POST|PATCH /v1/personas/{id}/contactos|direcciones`.

## 7. Código base relacionado
- `libs/plataforma/kernel` (`AggregateRoot`, `ValidationError`, `UnitOfWork`, `TenantContext`, `EventPublisher`, `IdGenerator`) y `kernel-infra` (`TypeOrmUnitOfWork`, `OutboxPublisher`, `uuidV7`, `AlsTenantContext`).
- `libs/shared/util`: solo `validarRuc` (módulo 11). Falta validador de DNI y celular; el árbol del plan los ubica en `shared/util` ("validadores DNI/RUC/celular").
- `libs/plataforma/org`: `Ruc` (valor), `PRODUCTOS` (`REST, PSI, COL, LIB, GYM, CLI, DOC, ECO, LEX`), `Suscripcion`, `RepositorioSuscripciones`, `PadronRucPort` + `PadronRucNulo` (patrón de puerto nulo).
- `libs/plataforma/catalogos`: `CATALOGO_PORT`/`CatalogoPort.validarItem`, `VERIFICADORES_REFERENCIAS`. `docs/datos-oficiales/tipo_doc_identidad.csv` (códigos `DNI`, `CE`, `RUC`, `PASAPORTE`...) y `ubigeo.csv` (`codigo, descripcion, departamento, provincia`) ya importados (spec 19b).
- `libs/plataforma/auditoria`: `AUDITORIA`/`AuditoriaPort`, `@Auditable`, `EVENTOS_AUDITADOS` (añadir `persona.*` si se audita por evento).
- Front: `libs/plataforma/catalogos-ui` (tag `type:ui`) es el patrón para `personas-ui`; `libs/shared/ui` (`vit-tabla`, `PanelLateralService`, `vit-acciones-formulario`, `MensajeValidacionPipe`).
- `codigo/` de P: nada de personas. Todo desde cero.

## 8. Diagramas relevantes
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd`
- D/`6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd` (nivel 2: persona maestra por tenant)
- D/`6_Plataforma_Operacion/OP-05_Identidad_en_tres_niveles.mmd`
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`
- D/`7_Control_Cambios_SazonPOS/CC-D02_Situacion_actual_y_situacion_objetivo.mmd` (persona por tenant + DNI/RUC)

## 9. Ambigüedades y preguntas candidatas
1. PL-10 pone IDN después de PER, pero RF-039 prellena desde IDN. Recomendación: implementar primero `idn-validacion-consulta` (mismo sprint 13) y que PER consuma `IdentidadPort`; si no, PER nace con `IdentidadNula` (patrón `PadronRucNulo`) y TR-CA-100 queda diferido.
2. ¿Quién tiene `plat.persona.*`? El RF exige "permiso del producto". Recomendación: los permisos `plat.persona.*` van en el manifiesto de plataforma y cada producto los incluye en sus roles; la API no conoce permisos de producto.
3. Persona sin documento: TR-CA-107 (042) asume «Juana Quispe» sin documento; RF-039 lo exige. Recomendación: documento opcional solo para tipo `SIN_DOCUMENTO` controlado (o DOC_0 del catálogo), con unicidad solo si hay número.
4. Evento de rol. Recomendación: `persona.rol_asignado` propio (los productos filtran por rol) y documentarlo como añadido al SRS.
5. TR-RNF-001 (< 800 ms) con consulta externa. Recomendación: la consulta IDN va en un paso previo (`GET` del buscador), no dentro del `POST` de registro; el `POST` solo persiste.
6. ¿Dónde vive `<ui-persona-buscador>`? SazónPOS está en otro repo y sube de Angular después de R2 (CC-11). Recomendación: lib `libs/plataforma/personas-ui` (`type:ui`) consumida por `admin-cliente`; SazónPOS lo integra en R2-12.
7. `producto_codigo (5)` vs. `PRODUCTOS` de 3 letras. Recomendación: usar `ProductoCodigo` de ORG y CHECK con la lista.
8. Código de pasaporte: SRS usa `PAS`, el catálogo importado `PASAPORTE`. Recomendación: manda el catálogo (código de TIPO_DOC_IDENTIDAD).
9. ¿Validar formato con atributos del catálogo (RF-039 paso 2) o con `idn.documento_valido` (RF-044)? Recomendación: ambos en capas: atributos `longitud`/`regex` del ítem para todo tipo; módulo 11 vía validador compartido de `shared/util` para RUC.
10. ¿`sexo` y `estado_civil` entran en `per.persona` en este spec? El SRS no los pide en RF-039; el documento de análisis los lista para PSI, GYM, CLI y LEX. Recomendación: columnas opcionales validadas contra los catálogos `SEXO` y `ESTADO_CIVIL`, sembrados en la migración de PER (o en la de `cat-tablas-sunat-fe` si va antes).
