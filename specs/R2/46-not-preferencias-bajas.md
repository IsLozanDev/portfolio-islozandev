# SPEC 46 — Notificaciones: bajas del destinatario por enlace firmado, con efecto en el envío y página pública de preferencias

> **Status:** Aprobado
> **Depends on:** SPEC 45, SPEC 42, SPEC 37, SPEC 14
> **Date:** 2026-11-26
> **Objective:** Agregar un enlace firmado de 30 días en el pie de cada correo, que abre la página pública `/preferencias` de `plataforma-admin`, donde el destinatario se da de baja de las promociones o del correo entero, baja que NOT guarda en `ntf.baja`, refleja en PER y respeta al enviar.

## Por qué existe este spec

Fila 46 de `docs/roadmap-specs.md` (R2-10: TR-RF-077). Contexto: `docs/spec-context/tr-not/not-recordatorios-preferencias.md`, parte b. La parte a (TR-RF-076) es el spec 45.

Lo que hay en el código hoy (revisado al redactar):

- `EnviarNotificacion.decidir` (42) aplica TR-RN-025 en este orden: consentimiento `PROMOCIONES` vigente en PER (solo con `personaId`), contacto inválido por `destino_hash` (`ntf.contacto_invalido`), ventana de 08:00 a 20:00. No hay bajas del destinatario.
- `HashearDestino` con `NOT_SAL_DESTINO`: el destino solo sale de NOT como hash.
- `EjecutarProgramacion` (45) llama a `enviar` a la hora, así que una baja hecha después de programar se respeta sin tocar el 45 (`DESCARTADA` con el motivo).
- Avisos de plataforma (44): `CODIGOS_AVISO` (`SUSCRIPCION_POR_VENCER`, `TENANT_SUSPENDIDO`, `SOPORTE_SOLICITADO`, `INTEGRIDAD_ROTA`), destinados a operadores y propietarios.
- PER (37): `ConsentimientoPort.revocar(personaId, finalidad, canal)` con canal `WEB`; exige un `actorId` en el contexto (`exigirUsuario`) y publica `consentimiento.revocado`, que AUD ya consume.
- `LimiteTasaGuard` (08) vive en `seguridad/src/interface/membresias.http.ts` y no se exporta por `index.ts`.
- `plataforma-admin` monta `/auth` fuera del shell (`app.routes.ts`); `vit-marco-auth` es el marco de esas pantallas.
- Matriz de límites: `comp('not', 'kernel', 'seg', 'org', 'evt', 'per', 'obs', 'aud')`.
- Última letra de migración: `01x`. Este spec usa `01y`; el 53, en paralelo, `01z`.

## Alcance

**Entra:**

- **Tabla `ntf.baja`** por tenant, canal, alcance y `destino_hash`, con `persona_id` opcional. Alcances: `PROMOCIONAL` (deja las promociones) y `CANAL` (deja todo el canal). Solo inserción; volver a suscribirse queda fuera.
- **Token firmado** HMAC-SHA256 con `NOT_CLAVE_ENLACE_PREFERENCIAS`, sin tabla. Carga: tenant, canal, `destino_hash`, `persona_id` si existe y vencimiento a 30 días. Rotar la clave invalida todos los enlaces.
- **Pie con el enlace** en todo correo con destino a persona o dirección, agregado al renderizar en `EnviarNotificacion`. Excepto las plantillas de `CODIGOS_AVISO` (operadores y propietarios). El enlace es `${NOT_URL_PREFERENCIAS}/preferencias#t=<token>`: el token va en el fragmento, que el navegador no manda al servidor ni queda en logs.
- **Efecto en el envío.** `decidir` suma la revisión de bajas después del consentimiento y antes del contacto inválido:
  - baja `CANAL` del destino → `DESCARTADO` con motivo `BAJA_CANAL`, sea cual sea la finalidad;
  - baja `PROMOCIONAL` del destino y finalidad `PROMOCIONAL` → `OMITIDO_SIN_CONSENTIMIENTO`.
  - Los transaccionales siguen saliendo con baja `PROMOCIONAL` (TR-CA-193).
- **Reflejo en PER.** Una baja `PROMOCIONAL` o `CANAL` con `persona_id` revoca además el consentimiento `PROMOCIONES` de PER si está vigente, con canal `WEB`, en la misma transacción. Así hay una sola fuente legal del consentimiento.
- **HTTP público** con `@Publico` y `LimiteTasaGuard` (10 por minuto por IP y ruta):
  - `POST /v1/notificaciones/preferencias/consultar` `{ token }` → destino enmascarado (`j***@gmail.com`), canal y bajas vigentes;
  - `PUT /v1/notificaciones/preferencias` `{ token, baja: 'PROMOCIONAL' | 'CANAL' }` → la baja registrada.
  - Token alterado, vencido o de otra clave → `400 ENLACE_INVALIDO` «Enlace inválido o vencido», sin datos (TR-CA-194).
  - El token va en el cuerpo, nunca en la URL.
- **Página pública `/preferencias`** en `plataforma-admin`, fuera del shell y sin sesión, en la lib nueva `libs/plataforma/preferencias-ui` (`type:feature`). Muestra el destino enmascarado y dos acciones: «Dejar de recibir promociones» y «Dejar de recibir todos los correos», esta con aviso de que también deja recordatorios y comprobantes.
- `LimiteTasaGuard` exportado desde `@vitrina/plataforma/seguridad` (hoy es interno del 08).
- Migración `db/01y_not_bajas.sql` con inverso y prueba SQL.

**No entra (specs futuros):**

- Canal preferido (CORREO|SMS|WHATSAPP) de RF-077: sin otro canal habilitado no cambia nada. Llega con WhatsApp (spec 104).
- Volver a suscribirse o deshacer una baja: un nuevo consentimiento se registra por PER (37) desde el producto.
- Preferencias con sesión en el portal del cliente final (R3-07, spec 92).
- Bajas por finalidades de PER distintas de `PROMOCIONES` (`COMPARTIR_PRODUCTOS`, `DATOS_SALUD`…).
- Encabezado `List-Unsubscribe` y un clic sin página (RFC 8058): pide un endpoint `POST` sin interacción; va en otro spec si Resend o los buzones lo exigen.
- Consulta y UI de bajas para el administrador del tenant.
- Revocación individual de enlaces.

## Base de código reutilizada

| Pieza | Qué se hace |
| --- | --- |
| `EnviarNotificacion.decidir` (42) | Suma la revisión de bajas; el resto no cambia. |
| `HashearDestino` (42) | `destino_hash` del token y de `ntf.baja`. |
| `ntf.contacto_invalido` (42) | Molde de `ntf.baja` (clave por hash, sin destino en claro). |
| `ConsentimientoPort.revocar` (37) | Reflejo de la baja en PER, canal `WEB`. |
| `ProcesarEventoProveedor` (42) | Molde del endpoint público que abre `contexto.run({ tenantId })` sin usuario. |
| `LimiteTasaGuard` (08) | Límite de tasa del endpoint público. |
| `vit-marco-auth` y pantalla de invitación (14, 15b) | Marco y pantalla tipo de la página pública. |
| `entorno-notificaciones.ts` (42) | Suma las dos variables nuevas. |

## Modelo de datos

### Migración `db/01y_not_bajas.sql` (+ `db/rollback/01y_not_bajas.sql`, `db/tests/01y_not_bajas.test.sql`)

```sql
CREATE TABLE ntf.baja (
  id            uuid PRIMARY KEY,
  tenant_id     uuid        NOT NULL,
  canal         varchar(10) NOT NULL CHECK (canal IN ('CORREO')),
  alcance       varchar(12) NOT NULL CHECK (alcance IN ('PROMOCIONAL','CANAL')),
  destino_hash  varchar(80) NOT NULL,
  persona_id    uuid,                                  -- sin FK a per (TR-RNF-119); solo para el reflejo en PER
  origen        varchar(10) NOT NULL DEFAULT 'ENLACE' CHECK (origen IN ('ENLACE')),
  registrada_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_baja UNIQUE (tenant_id, canal, alcance, destino_hash)
);
```

- RLS `ENABLE + FORCE` por `app.tenant_id`; `REVOKE` a `anon, authenticated` (regla 8).
- Solo inserción: trigger que rechaza `UPDATE` y `DELETE` (evidencia de TR-RNF-016).
- La misma baja dos veces no falla: el repositorio hace `INSERT … ON CONFLICT DO NOTHING` y devuelve la existente.
- Inverso: borra la tabla. Se niega si hay bajas (TR-RNF-016).
- Prueba SQL: única por (tenant, canal, alcance, hash); `UPDATE` y `DELETE` rechazados; aislamiento con dos `app.tenant_id`.

### Dominio (`libs/plataforma/notificaciones/src/domain/`)

- `baja.ts`: `ALCANCES_BAJA = ['PROMOCIONAL', 'CANAL']`; `Baja.registrar({ id, tenantId, canal, alcance, destinoHash, personaId })`; `bloqueaEnvio(bajas, finalidad)` → `'BAJA_CANAL' | 'BAJA_PROMOCIONAL' | null`.
- `enlace-preferencias.ts`: `CargaEnlace { tenantId; canal; destinoHash; personaId?; venceEn }`, `VIGENCIA_ENLACE_DIAS = 30`, `enmascararCorreo(correo)` (`j***@gmail.com`: primera letra y dominio).
- `errores.ts` suma `EnlaceInvalidoError` (`ENLACE_INVALIDO`, «Enlace inválido o vencido»).
- `estado-mensaje.ts`: motivo `MOTIVO_BAJA_CANAL = 'BAJA_CANAL'`.

### Puertos (`application/ports/`)

```ts
/** Firma y verifica el token del enlace (HMAC-SHA256, clave por entorno). */
export interface FirmadorEnlace {
  firmar(carga: CargaEnlace): string;
  /** null si la firma no coincide, el formato es inválido o venció. Nunca lanza con datos del token. */
  verificar(token: string, ahora: Date): CargaEnlace | null;
}

export interface RepositorioBajas {
  /** Del tenant del contexto. */
  delDestino(canal: Canal, destinoHash: string): Promise<Baja[]>;
  /** Idempotente: si ya existe, devuelve la existente. */
  registrar(baja: Baja): Promise<Baja>;
}
```

`RepositorioMensajes` suma `ultimoDestino(destinoHash)` para mostrar el destino enmascarado: el token no lleva el correo en claro.

### Casos de uso (`application/preferencias/`)

- `ConsultarPreferencias(token)`: verifica (`EnlaceInvalidoError` si no); con `contexto.run({ tenantId })`, lee bajas del destino y el último destino del hash; devuelve `{ destinoEnmascarado, canal, bajas: AlcanceBaja[] }`.
- `RegistrarBaja(token, alcance)`: verifica; en una transacción con el contexto del tenant registra la baja y, si hay `personaId` y `PROMOCIONES` vigente, llama a `ConsentimientoPort.revocar(personaId, 'PROMOCIONES', 'WEB')` con `actorId = personaId` (el titular decide). Logs con `destino_hash`, nunca el correo.
- `EnviarNotificacion` (cambia):
  - `decidir` consulta `bajas.delDestino` y aplica `bloqueaEnvio`;
  - `crearMensaje` agrega el pie con `firmador.firmar(...)` salvo para `CODIGOS_AVISO`. El pie se agrega después de renderizar y sanear la plantilla, así que una plantilla del tenant no puede quitarlo ni alterarlo.

### HTTP (`interface/preferencias.controller.ts`)

| Método y ruta | Cuerpo | Respuesta | Errores |
| --- | --- | --- | --- |
| `POST /v1/notificaciones/preferencias/consultar` | `{ token }` | `200 { destinoEnmascarado, canal, bajas }` | `400 ENLACE_INVALIDO`, `429 DEMASIADAS_SOLICITUDES` |
| `PUT /v1/notificaciones/preferencias` | `{ token, baja }` | `200 { bajas }` | `400 ENLACE_INVALIDO` o `SOLICITUD_INVALIDA`, `429` |

`@Publico`, `LimiteTasaGuard`, OpenAPI completo, sin `X-Sucursal-Id`. La respuesta ante token inválido es la misma para firma mala, vencido o formato roto. El permiso `publico.notificacion.preferencias` del SRS no se declara en el manifiesto: lo cubren `@Publico` y el token.

### Entorno (`entorno-notificaciones.ts`)

- `NOT_CLAVE_ENLACE_PREFERENCIAS`: mínimo 32 caracteres. Solo en `apps/api` y `apps/worker` (regla 9).
- `NOT_URL_PREFERENCIAS`: URL base de `plataforma-admin`.
- Las dos se suman a `OBLIGATORIAS_EN_PRODUCCION`. Fuera de producción, sin ellas el correo sale sin pie y queda un log de aviso; los endpoints responden `ENLACE_INVALIDO`.

### Front (`libs/plataforma/preferencias-ui`)

- Estructura de libs Angular de `CLAUDE.md`: `pages/preferencias/preferencias.page.{ts,html}`, `services/preferencias.cliente.ts`, `models/preferencias.ts`, `preferencias-ui.routes.ts`, `src/index.ts` por ruta explícita.
- `plataforma-admin/app.routes.ts`: `{ path: 'preferencias', loadChildren: … }` junto a `auth`, sin guard.
- La página lee el token del fragmento (`#t=`) y lo borra de la barra con `history.replaceState`. Estados:
  - cargando (`vit-cargando`);
  - enlace inválido (`vit-estado-vacio` con «Enlace inválido o vencido», sin datos);
  - preferencias, con el destino enmascarado y las dos acciones;
  - confirmación tras la baja.
- «Dejar de recibir todos los correos» se confirma con `AvisosService` y la clase `vit-destructivo`. Una baja ya vigente se muestra como hecha y su botón se deshabilita.
- **Pantalla tipo:** la de invitación de `/auth` (marco `vit-marco-auth` con tarjeta y acciones). Cambia en que no hay formulario de datos, solo dos acciones con confirmación. Si no encaja, se dibuja primero en el canvas «Vitrina · Diseño UI».

## Plan de implementación

1. **Migración.** `01y_not_bajas.sql`, inverso y prueba SQL.
2. **Dominio.** `Baja`, `bloqueaEnvio`, carga del enlace, `enmascararCorreo` y error, con pruebas: baja `CANAL` bloquea las dos finalidades; `PROMOCIONAL` solo las promocionales; enmascarado de correos cortos.
3. **Firmador y repositorio.** `FirmadorEnlace` HMAC (`node:crypto`, `timingSafeEqual`) y `RepositorioBajas` con TypeORM. Pruebas: token alterado en un byte, vencido, firmado con otra clave → `null`.
4. **Efecto en el envío y pie.** Cambios en `EnviarNotificacion`, variables de entorno. Pruebas:
   - promocional con baja `PROMOCIONAL` → `OMITIDO_SIN_CONSENTIMIENTO`;
   - transaccional con baja `PROMOCIONAL` → `ENCOLADO`;
   - cualquiera con baja `CANAL` → `DESCARTADO BAJA_CANAL`;
   - aviso de plataforma sin pie; plantilla de tenant con pie.
5. **Casos de uso y HTTP.** `ConsultarPreferencias`, `RegistrarBaja` con el reflejo en PER, controlador público, export de `LimiteTasaGuard`. Integración:
   - baja con persona revoca `PROMOCIONES`;
   - baja sin persona no llama a PER;
   - repetir la baja no duplica;
   - token de un tenant no lee bajas de otro.
6. **Página.** Lib `preferencias-ui`, ruta en `plataforma-admin`, pruebas unitarias del cliente y de la página (cuatro estados).
7. **Cierre.**
   - `code-simplifier` sobre los archivos tocados.
   - `pnpm db:up:remoto` en dev.
   - Humo: enviar `PRUEBA_CORREO` a un correo propio, abrir el enlace del pie, darse de baja de promociones y ver que un transaccional sigue llegando; darse de baja del canal y ver el siguiente `DESCARTADO`.
   - Playwright con `nx serve plataforma-admin`: los cuatro estados en claro y oscuro y a 600 px, consola sin errores, axe-core sin violaciones AA.
   - `npx nx run-many -t lint test -p notificaciones seguridad preferencias-ui plataforma-admin api worker migrar`.

## Criterios de aceptación

- [ ] TR-CA-193: con baja `PROMOCIONAL` desde el enlace, un promocional a esa persona queda `OMITIDO_SIN_CONSENTIMIENTO` y un recordatorio transaccional sale `ENCOLADO`; `PROMOCIONES` de PER queda revocado con canal `WEB`.
- [ ] TR-CA-194: token alterado → `400 ENLACE_INVALIDO` «Enlace inválido o vencido» sin destino ni tenant en la respuesta; la página muestra el mismo texto sin datos.
- [ ] Token de más de 30 días → mismo `ENLACE_INVALIDO`.
- [ ] Baja `CANAL` → todo correo posterior a ese destino, transaccional o promocional, queda `DESCARTADO` con `BAJA_CANAL`.
- [ ] Baja hecha después de programar un recordatorio (45) → a la hora la programación queda `DESCARTADA` con el motivo, sin correo.
- [ ] Destino sin persona (correo suelto) → la baja se guarda por `destino_hash` y se respeta; no se llama a PER.
- [ ] Todo correo con plantilla de tenant o base, salvo los de `CODIGOS_AVISO`, lleva el pie con el enlace; el token va en el fragmento `#t=` y no aparece en logs de la API.
- [ ] La misma baja dos veces responde `200` y deja una sola fila.
- [ ] Más de 10 solicitudes por minuto desde la misma IP → `429 DEMASIADAS_SOLICITUDES` con `Retry-After`.
- [ ] Aislamiento (TR-RNF-010): prueba SQL con dos `app.tenant_id`; un token de un tenant no ve ni registra bajas de otro.
- [ ] `ntf.baja` rechaza `UPDATE` y `DELETE`; el inverso se niega si hay bajas (TR-RNF-016).
- [ ] Logs sin correo ni token (TR-RNF-026); el destino solo como hash.
- [ ] Página `/preferencias` verificada con Playwright en tema claro y oscuro y a 600 px, consola sin errores y axe-core sin violaciones WCAG 2.1 AA (TR-RNF-019).
- [ ] En producción la API y el worker no arrancan sin `NOT_CLAVE_ENLACE_PREFERENCIAS` y `NOT_URL_PREFERENCIAS`.
- [ ] Endpoints con OpenAPI bajo `/v1`.
- [ ] Migración `01y_not_bajas` reversible y probada en CI contra PostgreSQL 16.
- [ ] Cobertura de dominio de `notificaciones` ≥ 70 %.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md`; persistencia con TypeORM; el único SQL nuevo es el `ON CONFLICT DO NOTHING` del registro, encapsulado en el adaptador.
- [ ] `npx nx run-many -t lint test -p notificaciones seguridad preferencias-ui plataforma-admin api worker migrar` verde; `nx affected` verde en el CI del PR.

## Decisiones

- **Sí:** bajas en NOT (`ntf.baja`, por `destino_hash`) y reflejo en PER cuando hay persona. Decisión del usuario. NOT cubre direcciones sueltas; PER sigue siendo la fuente legal del consentimiento `PROMOCIONES`.
- **No:** solo PER. Un correo sin persona no podría darse de baja.
- **Sí:** dos alcances, promociones y canal entero. Decisión del usuario. TR-RN-025 pide que los transaccionales respeten la baja del canal. La página avisa que también se dejan recordatorios y comprobantes.
- **No:** canal preferido en este spec. Decisión del usuario. Con solo CORREO habilitado no cambia nada; llega con el 104.
- **Sí:** página pública en `plataforma-admin`, lib `preferencias-ui`. Decisión del usuario. Reutiliza `shared/ui` y `vit-marco-auth`, y respeta la regla 8 (el front solo habla con la API).
- **No:** HTML servido por la API. Sale del patrón y no reutiliza los componentes.
- **Sí:** token HMAC con tenant, canal, `destino_hash` y `persona_id`, sin tabla. Decisión del usuario. Rotar `NOT_CLAVE_ENLACE_PREFERENCIAS` invalida todos los enlaces.
- **Sí:** enlace en todos los correos salvo los avisos de plataforma. Decisión del usuario. Los avisos van a operadores y propietarios del servicio, no a destinatarios del tenant.
- **Sí:** token en el fragmento de la URL y en el cuerpo de las peticiones. El fragmento no llega al servidor ni a los logs; el contexto proponía `GET ?token=`.
- **Sí:** `actorId = personaId` al revocar en PER. La revocación la hace el titular, sin usuario de plataforma; `revocado_por` queda con quien decidió.
- **Sí:** el destino se muestra enmascarado desde el último mensaje del hash. El token no lleva el correo en claro.
- **Sí:** el pie se agrega después del saneado de la plantilla. Una plantilla del tenant no puede quitarlo ni alterarlo.
- **Sí:** migración `01y`. El 53, en paralelo, usa `01z`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Baja `CANAL` por error corta comprobantes y recordatorios | Confirmación con `AvisosService` y texto explícito. Volver a suscribirse se hace por PER desde el producto. |
| Se filtra la clave del enlace | Solo por entorno; rotarla invalida todos los enlaces (los nuevos correos traen uno nuevo). |
| Reenviar un correo da el enlace a otra persona | Solo permite darse de baja; no muestra datos más allá del destino enmascarado. |
| Consulta de bajas en cada envío | Índice único por (tenant, canal, alcance, hash); una consulta por mensaje. Caché solo si TR-RNF-001 lo pide. |
| `LimiteTasaGuard` es en memoria por instancia | Igual que el 08; con varias instancias el límite es por instancia. Redis queda para cuando haya más de una. |

## Ejecución en paralelo (worktree)

- Se implementa en un worktree propio (`spec-46-not-preferencias-bajas`), en paralelo con el 53.
- Archivos compartidos con el 53:
  - `apps/api` y `apps/worker` (registro de módulos y esquema de entorno): líneas distintas;
  - letras de migración: `01y` aquí, `01z` en el 53.
- El manifiesto PLAT no se toca aquí.
- El segundo PR se rebasa sobre el primero.

## Lo que **no** entra en este spec

- Canal preferido (spec 104).
- Volver a suscribirse desde el enlace.
- Preferencias con sesión en el portal (spec 92).
- `List-Unsubscribe` de un clic.
- Vista de bajas para el administrador.

Cada uno, si llega, va en su propio spec.
