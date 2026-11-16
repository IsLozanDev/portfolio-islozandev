# Contexto para idn-validacion-consulta-dni-ruc

Paquete de contexto (no es el spec). Fuentes: `CLAUDE.md`, `docs/roadmap-specs.md`, SRS (RF, Criterios GWT, Reglas de negocio, RNF, Componentes, Consumidores, Matriz Proceso-RF), `3_plan.json` (R2-02), plan (sec. 5, árbol `identidad/`), specs 03 y 12, diagramas OP-04 a OP-09, T-05, PL-10, código real en `libs/`. Ruta de planes P = `docs/Plataforma_Plan_Mermaid_Estructura_Codigo/Plataforma_Plan/`; diagramas D = `01-analysis/component-transversal/Vitrina_Productos_Todos_los_Mermaid/`.

## 1. Alcance y dependencias
- Historia R2-02 (sprint 13, 7 h, Back, R2): "Validación y consulta de DNI/RUC con caché, proveedor y cuota por plan" (RF 044 a 047). Este paquete cubre 044, 045, 046 (nivel 1 de OP-05); la cuota (047) y la consola van en `idn-cuota-y-consola-proveedor.md`.
- Lib nueva `libs/plataforma/identidad` (árbol del plan: "TR-IDN · DNI/RUC vía proveedor con caché"), tags `scope:plataforma`, `type:backend`, `comp:idn`. Esquema `idn` (OP-09).
- Spec 03 dejó `PadronRucPort` + `PadronRucNulo` en `libs/plataforma/org` ("el caso de uso no cambia cuando llegue TR-IDN") y difirió TR-CA-006 (advertencia NO HABIDO). Spec 12 usa el mismo puerto nulo en el alta de tenant. Este spec trae el adaptador real.
- PL-10: `CAT --> PER --> IDN`. Funcionalmente PER (RF-039) y ORG (RF-002) consumen IDN; IDN solo necesita kernel, SEG (`@Permiso`) y AUD. Puede construirse antes que PER.
- Partición propuesta:

| Spec | Slug | RF | h | Áreas | Depende de |
|---|---|---|---|---|---|
| A | idn-validacion-consulta | 044, 045, 046 | 10 | (a) dominio `DocumentoIdentidad` (DNI, RUC módulo 11, CE, pasaporte) + DDL `idn`; (b) `ConsultarDocumento` con caché central, proveedores con respaldo (timeout 3 s, circuit breaker) y bitácora con hash; (c) HTTP `/v1/identidad` + adaptador de `PadronRucPort` que reemplaza al nulo | 07, 20a, 11; `CuotaPort` "sin límite" hasta `idn-cuota` |

- Si A se pasa de 10 h: sacar 044 a `shared/util` (validadores puros, 2 h) como spec previo.
- Fuera de alcance: cuota mensual, aviso 80 % y consola (047); identidad portable (048-051, R4); carga diaria masiva del padrón SUNAT (`SunatPadronAdapter` de OP-08, P3); UI (el prellenado lo muestra `<ui-persona-buscador>` de TR-PER).
- Constitución aplicable: reglas 1-6, 8, 9 (credenciales del proveedor solo por entorno), 10 (proveedor detrás de puerto), 11; código limpio; DoD.

## 2. RF
Módulo MOD-07 (TR-IDN), proceso TR-P10 (046 también TR-P04), Must, fase MVP en SRS, R2 en el plan.

| ID | Nombre | Permiso | App | RN | RNF | Actor |
|---|---|---|---|---|---|---|
| TR-RF-044 | Validar formato de DNI y RUC | plat.identidad.validar | APP-03 | TR-RN-002, 031 | TR-RNF-001, 012 | Módulo de producto |
| TR-RF-045 | Consultar DNI con caché y proveedor | plat.identidad.consultar | APP-03 | TR-RN-031, 032 | TR-RNF-007, 111, 001 | Módulo de producto, usuario operativo, proveedor de identidad |
| TR-RF-046 | Consultar RUC con estado y condición | plat.identidad.consultar | APP-03 | TR-RN-019, 031, 032 | TR-RNF-007, 111 | Módulo de producto, encargado de facturación, proveedor |

- **044** Sin precondición. `idn.documento_valido(tipo, numero)`: `tipo_doc` (DNI|RUC|CE|PAS) -> `{valido, motivo}` con motivo LONGITUD, PREFIJO, DIGITO_VERIFICADOR, CARACTERES. Sin costo de consulta.
- **045** Precondición: DNI con formato válido; cuota disponible o sin límite. Flujo: `idn.consultar(DNI, numero, motivo)` -> caché vigente => `CACHE` -> si no, reserva cuota y llama al proveedor de prioridad 1, ante error o timeout al de prioridad 2 -> guarda en caché solo nombres y apellidos con `ttl_dias` del proveedor -> bitácora con número hasheado, usuario, producto, motivo y resultado. Motivo: REGISTRO_CLIENTE|EMISION_COMPROBANTE|VERIFICACION_IDENTIDAD|OTRO. Respuesta: nombres, apellidos, `fuente`, `consultado_en`; o NO_ENCONTRADO. Componentes: TR-IDN, TR-AUD.
- **046** Precondición: RUC válido. Resuelve desde caché o proveedor `SUNAT_PADRON`; devuelve `razon_social, estado, condicion, direccion_fiscal, ubigeo, apto_factura` (ACTIVO y HABIDO). Registra bitácora.
- Interfaz (hoja Componentes, 12 RF usan TR-IDN): `IdentidadPort.validar/consultar(tipo, numero, motivo)` con caché y cuota. Hoja Consumidores: los 9 productos consumen (LEX integra); "invocado al registrar personas o emitir comprobantes".

## 3. Criterios GWT
| ID | RF | Tipo | Escenario |
|---|---|---|---|
| TR-CA-112 | 044 | Positivo | RUC 20100070970 cumple módulo 11: válido |
| TR-CA-113 | 044 | Negativo | RUC 30601234567: inválido, motivo PREFIJO |
| TR-CA-114 | 044 | Negativo | DNI 4578123A: inválido, motivo CARACTERES |
| TR-CA-115 | 045 | Positivo | DNI 45781236 consultado hace 10 días, TTL 30: otro tenant recibe «Juana Quispe Mamani» con CACHE sin descontar cuota |
| TR-CA-116 | 045 | Positivo | RENIEC_CONVENIO no responde en 3 s: datos del proveedor de prioridad 2, resultado PROVEEDOR |
| TR-CA-117 | 045 | Negativo | Proveedor devuelve dirección: la caché guarda solo nombres y apellidos |
| TR-CA-118 | 046 | Positivo | RUC 20512345678 ACTIVO y HABIDO: razón social y `apto_factura = true` |
| TR-CA-119 | 046 | Borde | RUC 20498765432 BAJA DE OFICIO: `apto_factura = false`, motivo «Estado BAJA DE OFICIO» |

Diferido de spec 03: **TR-CA-004** (empresa con razón social del padrón) y **TR-CA-006** (NO HABIDO: registra y advierte «Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar»); entran aquí al conectar el adaptador real de `PadronRucPort` (este último exige ampliar la respuesta de `RegistrarEmpresa`).
Faltan y se proponen: DNI con dígito verificador inválido (si se valida, P5); ambos proveedores caídos -> `PROVEEDOR_NO_DISPONIBLE` sin bloquear el registro manual (TR-RNF-007) y sin consumir cuota; caché vencida -> nueva consulta; bitácora sin número en claro (escaneo de TR-RNF-111); aislamiento de la bitácora por tenant; NO_ENCONTRADO no se guarda en caché (o con TTL corto).

## 4. Reglas y RNF
| ID | Texto corto |
|---|---|
| TR-RN-002 | RUC 11 dígitos, prefijo 10/15/17/20, módulo 11 SUNAT; DNI 8 dígitos. |
| TR-RN-031 | Validar antes de consultar; caché vigente según TTL del proveedor; bitácora con número en SHA-256 con sal; cuota solo si se llama al proveedor. |
| TR-RN-032 | Caché solo con campos mínimos: DNI nombres y apellidos; RUC razón social, estado, condición, domicilio fiscal. Prohibido dirección, foto, nacimiento, estado civil del DNI. |
| TR-RN-019 | Factura exige RUC; advertir si el estado no es ACTIVO o condición NO HABIDO. |
| TR-RNF-007 | Integraciones externas con timeout, reintento con backoff y circuit breaker; su caída no bloquea la operación. |
| TR-RNF-111 | Números de documento en bitácoras y logs con SHA-256 y sal de plataforma, nunca en claro (escaneo semanal). |
| TR-RNF-001 | p95 < 800 ms en mostrador (caché obligatoria; el proveedor tiene 3 s de timeout). |
| TR-RNF-012 | OWASP ASVS 2. |

Heredados por CLAUDE.md: 002, 003, 008, 010, 011, 013/112, 024/119, 025, 026, 101, 106.

## 5. Historia del backlog (3_plan.json)
| ID | Sprint | Horas | Componente | RF | Tipo | Release |
|---|---|---|---|---|---|---|
| R2-02 | 13 | 7 | TR-IDN | TR-RF-044 a 047 | Back | R2 |

Relacionadas: R2-01 (TR-PER), R2-05 (FE emitir factura usa `apto_factura`), R2-12 (CC-06 SazónPOS: persona por tenant + DNI/RUC). Sprint 13: 2027-04-19 a 2027-05-02, 20/20 h.

## 6. Tablas SQL, eventos, puertos y permisos
- Migración propuesta: `db/01k_idn.sql` (+ `rollback/` y `tests/01k_idn.test.sql`). R1 terminó en `01i`.
- Tablas (OP-09, sin DDL en `codigo/`; "operacion/sql/02_idn" citado por el SRS no está en el repo):
  - `idn.proveedor`: `codigo` PK (RENIEC_CONVENIO, proveedor privado, SUNAT_PADRON), `tipos_doc` varchar[], `prioridad`, `ttl_dias`, `activo`, `timeout_ms`. Global, sin tenant. Credenciales fuera de la tabla (entorno).
  - `idn.cache_documento`: PK `(tipo_doc, numero)`, `datos` jsonb mínimos con CHECK de claves permitidas (SRS cita `ck_cache_campos`), `fuente`, `consultado_en`, `expira_en`. Global entre tenants (TR-CA-115); sin RLS de tenant; solo accesible por el rol de la API.
  - `idn.consulta_log`: `id` bigint, `tenant_id` (RLS), `usuario_id`, `producto_codigo`, `tipo_doc`, `numero_hash` char(64), `motivo`, `resultado` (CACHE|PROVEEDOR|NO_ENCONTRADO|INVALIDO|CUOTA_AGOTADA|PROVEEDOR_NO_DISPONIBLE), `proveedor`, `consultado_en`. Solo inserción.
  - `idn.cuota`: la crea `idn-cuota` (o este spec con la tabla vacía, P2).
  - REVOKE a `anon, authenticated` en `idn` (regla 8).
- Eventos: el SRS no define eventos de IDN para 044-046. No hace falta outbox (consultas sin cambio de negocio, salvo la bitácora).
- Puertos (OP-08): provee `IdentidadPort` (`validar`, `consultar(tipo, numero, motivo)`); internos `ProveedorIdentidad` (adaptadores por proveedor + decorador `ProveedorConRespaldo` con circuit breaker), `CacheIdentidadRepository` (TypeORM), `BitacoraConsultas`, `CuotaPort` (reservar/liberar, nulo "sin límite" hasta 047), `HasherDocumento` (SHA-256 con sal desde entorno). Adaptador de `PadronRucPort` de ORG basado en `IdentidadPort`.
- Permisos (SRS): `plat.identidad.validar`, `plat.identidad.consultar`. Alta en `plat.manifiesto.json`.
- Endpoints (OP-06/OP-08): `GET /v1/identidad/{tipo}/{numero}?motivo=` y `GET /v1/identidad/{tipo}/{numero}/validez`.
- Etiquetas Nx: `scope:plataforma`, `type:backend`, `comp:idn`.

## 7. Código base relacionado
- `libs/plataforma/org/src/application/ports/padron-ruc.port.ts`: `PadronRucPort.consultar(ruc) -> DatosPadron {razonSocial, estado, condicion} | null`. `infrastructure/padron-ruc.nulo.ts`: `PadronRucNulo` (devuelve null). `org.module.ts` lo enlaza con `{ provide: PADRON_RUC, useClass: PadronRucNulo }` y lo inyecta en `RegistrarEmpresa` (`empresa.casos-de-uso.ts`: `padron?.razonSocial ?? comando.razonSocial`). Exportados por `org/src/index.ts`: `PadronRucNulo`, `PADRON_RUC`, tipos `DatosPadron`, `PadronRucPort`. La prueba `org/test/empresa.casos-de-uso.spec.ts` ya cubre un padrón falso con «SABORES DEL SUR S.A.C.».
- `libs/shared/util/src/ruc.ts`: `validarRuc` (prefijo + módulo 11) usado por `org/domain/valores.ts` (`Ruc`). Falta DNI y el motivo detallado (LONGITUD, PREFIJO, DIGITO_VERIFICADOR, CARACTERES): `validarRuc` devuelve solo boolean.
- `libs/plataforma/auditoria`: `AuditoriaPort` (si la consulta se audita además de la bitácora).
- `libs/plataforma/kernel-infra`: `TypeOrmUnitOfWork`, `AlsTenantContext`, `SystemClock`; `observabilidad`: trazas OTel para medir el p95 y el timeout.
- `docs/datos-oficiales/tipo_doc_identidad.csv`: códigos `DNI`, `CE`, `RUC`, `PASAPORTE` (SRS usa `PAS`).
- `codigo/` de P: sin código de identidad.

## 8. Diagramas relevantes
- D/`6_Plataforma_Operacion/OP-04_Se_puede_compartir_este_dato_de_persona_entre_sistemas.mmd` (nivel 1)
- D/`6_Plataforma_Operacion/OP-05_Identidad_en_tres_niveles.mmd`
- D/`6_Plataforma_Operacion/OP-06_Secuencia_consulta_de_DNI_o_RUC_nivel_1.mmd`
- D/`6_Plataforma_Operacion/OP-08_Modulo_de_identidad_en_arquitectura_hexagonal.mmd`
- D/`6_Plataforma_Operacion/OP-09_Modelo_de_datos_del_servicio_de_identidad_schema_idn.mmd`
- D/`8_Diseno_Piloto/2_Plataforma_Transversal/T-05_Modelo_de_dominio_Personas_e_identidad.mmd` (CacheDocumento, DocumentoIdentidad)
- P/`1_Mermaid/PL-10_Dependencias_entre_componentes_transversales.mmd`

## 9. Ambigüedades y preguntas candidatas
1. ¿Qué proveedor real? El SRS nombra RENIEC_CONVENIO y SUNAT_PADRON, sin contrato ni API. Recomendación: en el spec, dos adaptadores: uno HTTP genérico para un proveedor privado elegido por el usuario (credenciales por entorno) y uno falso configurable para dev, CI y staging; RENIEC por convenio queda como adaptador futuro.
2. ¿La cuota entra aquí? R2-02 junta 044-047 en 7 h. Recomendación: este spec usa `CuotaPort` nulo "sin límite" y la tabla `idn.cuota` la crea `idn-cuota`; así A cabe en 10 h.
3. Padrón SUNAT: ¿consulta en línea o carga diaria (OP-08 `SunatPadronAdapter`)? Recomendación: en línea vía el mismo proveedor privado en R2; la carga del padrón reducido (archivo de ~GB) queda fuera de alcance.
4. ¿OP-06 como función SQL `idn.consultar` o lógica en TypeScript? Recomendación: lógica en el caso de uso con TypeORM (regla 11); SQL crudo solo para la reserva atómica de cuota (`UPDATE ... WHERE consumidas < incluidas RETURNING`), con la razón en el spec.
5. DNI: ¿se valida dígito verificador? El SRS solo pide 8 dígitos (TR-RN-002). Recomendación: no; motivo DIGITO_VERIFICADOR solo para RUC.
6. Caché global sin tenant: rompe la "doble barrera" en apariencia. Recomendación: documentarlo como excepción justificada (dato público de nivel 1, OP-04), tabla sin RLS pero sin grants a `anon/authenticated` y la bitácora sí por tenant.
7. Sal del hash (TR-RNF-111): ¿por plataforma o por tenant? Recomendación: una sal de plataforma por ambiente en variable de entorno (`IDN_SAL_DOCUMENTO`), como dice el RNF.
8. TR-CA-006 (advertencia NO HABIDO) cambia la respuesta de `RegistrarEmpresa`. Recomendación: incluirlo aquí añadiendo `advertencias` a la respuesta HTTP de empresas (17a) y mostrarla en `admin-cliente` (17c) en un spec de UI corto, o diferirlo de nuevo.
9. Enlace con ORG sin que `org` dependa de `identidad`. Recomendación: el adaptador `PadronRucIdentidad` vive en `identidad` (importa el tipo de `org`) y `apps/api` sobrescribe el provider `PADRON_RUC`; `org` no cambia.
