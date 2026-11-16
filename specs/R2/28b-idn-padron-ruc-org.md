# SPEC 28b — Identidad: padrón RUC real en ORG, prellenado de razón social y advertencia de contribuyente no apto

> **Status:** Draft
> **Depends on:** SPEC 03, SPEC 12, SPEC 17a, SPEC 17b, SPEC 17c, SPEC 28
> **Date:** 2026-11-16
> **Objective:** Reemplazar `PadronRucNulo` por un adaptador de `PadronRucPort` sobre `IdentidadPort` para que registrar una empresa (y el alta de tenant) tome la razón social del padrón y devuelva una advertencia cuando el contribuyente no está ACTIVO o está NO HABIDO, mostrada en `admin-cliente` y en la consola de tenants.

## Por qué existe este spec

Fila 28b de `docs/roadmap-specs.md`, separada del 28 al reducir su alcance. Cierra lo que el spec 03 dejó diferido: **TR-CA-004** completo (razón social del padrón) y **TR-CA-006** (advertencia NO HABIDO). Contexto: `docs/spec-context/tr-idn/idn-validacion-consulta-dni-ruc.md` (sec. 9, preguntas 8 y 9).

Lo que hay en el código hoy (revisado al redactar):

- `org/application/ports/padron-ruc.port.ts`: `PadronRucPort.consultar(ruc) → DatosPadron { razonSocial, estado, condicion } | null`. `PadronRucNulo` siempre devuelve `null`.
- `org.module.ts`: `OrgModule` estático, enlaza `{ provide: PADRON_RUC, useClass: PadronRucNulo }` y lo inyecta en `RegistrarEmpresa`.
- `RegistrarEmpresa.ejecutar` consulta el padrón fuera de su transacción; `padron?.razonSocial ?? comando.razonSocial`; devuelve `{ empresaId, sucursalPrincipalId }`.
- `apps/api/src/org/alta-tenant.ts`: `AltaTenant` llama a `registrarEmpresa.ejecutar` dentro de su transacción y devuelve `TenantDadoDeAlta` (sin advertencias). `validarComando` exige `razonSocial`.
- `apps/api/src/org/organizacion.http.ts`: `EmpresaRegistradaDto { empresa_id, sucursal_principal_id }`. `alta-tenant.http.ts`: `TenantDadoDeAltaDto`.
- `admin-cliente/pages/empresa-formulario`: campos RUC, razón social (obligatoria), nombre comercial, ubigeo y dirección fiscal; usa `AvisosService`. `EmpresasCliente.registrar`.
- `consola-tenants/pages/tenant-alta` y `TenantsCliente`.
- `SesionService.tiene(permiso)` en `shared/auth`. `AvisosService.advertencia(titulo, texto)` en `shared/ui`.
- `PLAT_PROPIETARIO` en `plat.manifiesto.json` sin permisos de identidad (el 28 deja el manifiesto en 1.16.0 con `plat.identidad.validar` y `plat.identidad.consultar`).

## Alcance

**Entra:**

- `PadronRucIdentidad` en `apps/api`: implementa `PadronRucPort` llamando a `IdentidadPort.consultar` y se enlaza en lugar del nulo.
- `OrgModule.register({ padronRuc? })` para recibir el proveedor desde la app; sin opción sigue el nulo.
- Advertencias de padrón en el dominio de ORG y en la respuesta de `RegistrarEmpresa`, `POST /v1/org/empresas` y el alta de tenant.
- `admin-cliente`: prellenado de razón social desde el padrón al salir del campo RUC y aviso de advertencias tras registrar.
- `consola-tenants`: aviso de advertencias tras el alta.
- Manifiesto 1.17.0: `PLAT_PROPIETARIO` recibe `plat.identidad.validar` y `plat.identidad.consultar`.

**No entra:**

- Guardar estado o condición SUNAT en `org.empresa`.
- Prellenado en el formulario de alta de la consola (el operador escribe la razón social; el padrón la sobrescribe igual).
- Revalidar empresas ya registradas o avisos cuando cambia el estado en SUNAT.
- Bloquear el registro de un contribuyente no apto: solo se advierte (TR-RN-019).
- Edición de empresa: el RUC no cambia al editar, no se consulta el padrón.

## Modelo de datos

Sin tablas ni migraciones nuevas. Cambian tipos y DTO.

### ORG — dominio (`org/src/domain/advertencias-padron.ts`)

```ts
export const ESTADO_ACTIVO = 'ACTIVO';
export const CONDICION_HABIDO = 'HABIDO';

/** TR-RN-019, TR-CA-006: el registro sigue; se advierte que no podrá facturar. */
export function advertenciasDelPadron(padron: DatosPadron | null): string[];
```

| Caso | Texto |
| --- | --- |
| `condicion !== 'HABIDO'` | `Contribuyente <condicion>: no podrá emitir comprobantes hasta regularizar` (con NO HABIDO es el texto literal de TR-CA-006) |
| `estado !== 'ACTIVO'` | `Contribuyente en estado <estado>: no podrá emitir comprobantes hasta regularizar` |
| `padron === null` | `[]` (sin padrón no se advierte) |

Pueden salir las dos. `DatosPadron` y `PadronRucPort` no cambian.

### ORG — caso de uso y módulo

- `RegistrarEmpresa.ejecutar` → `{ empresaId, sucursalPrincipalId, advertencias: string[] }`.
- `OrgModule.register(opciones?: { padronRuc?: Provider; imports?: ModuleMetadata['imports'] })`: si viene `padronRuc`, reemplaza el enlace por defecto `{ provide: PADRON_RUC, useClass: PadronRucNulo }`. `PadronRucNulo` se conserva para pruebas y para quien no registre identidad.

### `apps/api/src/identidad/padron-ruc.identidad.ts`

```ts
export class PadronRucIdentidad implements PadronRucPort {
  constructor(private readonly identidad: IdentidadPort) {}
  async consultar(ruc: string): Promise<DatosPadron | null>;
}
```

- Llama a `identidad.consultar({ tipo: 'RUC', numero: ruc, motivo: 'VERIFICACION_IDENTIDAD', productoCodigo: 'PLAT' })` y mapea `razonSocial`, `estado`, `condicion`.
- `DocumentoNoEncontradoError` y `ProveedorNoDisponibleError` → `null`: la razón social sale del comando, como hoy (TR-RNF-007). Cualquier otro error se propaga.
- `app.module.ts`: `OrgModule.register({ imports: [IdentidadModule…], padronRuc: { provide: PADRON_RUC, useFactory: (identidad) => new PadronRucIdentidad(identidad), inject: [IDENTIDAD] } })`.

### HTTP

- `EmpresaRegistradaDto` suma `advertencias: string[]` (siempre presente, vacío si no hay).
- `TenantDadoDeAlta` y `TenantDadoDeAltaDto` suman `advertencias: string[]`, tomadas del resultado de `registrarEmpresa`.
- OpenAPI actualizado. Sin endpoints nuevos: el prellenado usa `GET /v1/identidad/RUC/{ruc}?motivo=VERIFICACION_IDENTIDAD` del 28.

### Frontend

**`admin-cliente` — `empresa-formulario`** (pantalla tipo «formulario», solo en modo alta):

- `services/padron.cliente.ts`: `PadronCliente.consultarRuc(ruc) → { razonSocial, estado, condicion, aptoFactura, motivoNoApto } | null` sobre el endpoint del 28; 404 y 503 → `null`.
- Al salir del campo RUC con un RUC válido (`validarRuc` de `shared/util`) y si `SesionService.tiene('plat.identidad.consultar')`: muestra `vit-cargando` en línea, prellena `razonSocial` y la deja de solo lectura. Si el padrón no responde o no encuentra, el campo queda editable y obligatorio, con la ayuda «No se encontró en el padrón; ingrésela manualmente». Cambiar el RUC vuelve a habilitar el campo.
- Si `aptoFactura` es `false`, debajo del RUC un `mat-hint` con el motivo, antes de registrar.
- Tras `registrar`, si `advertencias` no está vacío: `AvisosService.advertencia('Empresa registrada con observaciones', advertencias.join('\n'))`; luego la navegación de siempre.
- `EmpresasCliente.registrar` y el modelo `EmpresaRegistrada` suman `advertencias`.

**`consola-tenants` — `tenant-alta`:** `TenantsCliente` y su modelo suman `advertencias`; tras el alta, si hay, el mismo `AvisosService.advertencia`.

Sin colores nuevos: `mat-hint` y avisos con los tokens existentes. Verificación en tema claro y oscuro y a 600 px.

### Manifiesto

`plat.manifiesto.json` 1.17.0: `PLAT_PROPIETARIO` suma `plat.identidad.validar` y `plat.identidad.consultar`.

### Eventos

Ninguno nuevo. `empresa.creada` no cambia.

## Plan de implementación

1. **Dominio ORG.** `advertenciasDelPadron` con pruebas (NO HABIDO, BAJA DE OFICIO, ambos, apto, `null`). `RegistrarEmpresa` devuelve `advertencias`; prueba con padrón falso (la de «SABORES DEL SUR S.A.C.» se amplía). `nx test org` verde.
2. **Módulo.** `OrgModule.register` con nulo por defecto; los usos actuales pasan a `OrgModule.register()`. Todo sigue verde.
3. **Adaptador.** `PadronRucIdentidad` con pruebas unitarias (mapeo, 404 → null, 503 → null, otro error se propaga) y enlace en `app.module.ts`.
4. **HTTP.** `advertencias` en `EmpresaRegistradaDto`, `TenantDadoDeAlta` y su DTO. Integración en `apps/api` con el proveedor falso del 28: TR-CA-004 y TR-CA-006 por `POST /v1/org/empresas`, y alta de tenant con RUC NO HABIDO.
5. **Manifiesto.** 1.17.0 con los permisos en `PLAT_PROPIETARIO`; aplicar en dev.
6. **admin-cliente.** `PadronCliente`, prellenado, hint de no apto y aviso; pruebas unitarias de la página y del cliente.
7. **consola-tenants.** Aviso tras el alta; prueba de la página.
8. **Cierre.** `nx affected -t lint test build`, `code-simplifier`, verificación con Playwright (API con `IDN_PROVEEDOR=falso`) y staging.

## Criterios de aceptación

- [ ] **TR-CA-004:** con el padrón respondiendo, `RegistrarEmpresa` con un RUC ACTIVO y HABIDO guarda la razón social del padrón aunque el comando traiga otra, crea la sucursal principal `0000` y devuelve `advertencias = []`.
- [ ] **TR-CA-006:** con un RUC NO HABIDO, la empresa se registra y la respuesta trae «Contribuyente NO HABIDO: no podrá emitir comprobantes hasta regularizar».
- [ ] RUC 20498765432 (BAJA DE OFICIO) se registra con «Contribuyente en estado BAJA DE OFICIO: no podrá emitir comprobantes hasta regularizar».
- [ ] Con el proveedor caído o el RUC no encontrado, la empresa se registra con la razón social del comando y sin advertencias; sin razón social en el comando responde 422 como hoy.
- [ ] El alta de tenant desde la consola con un RUC NO HABIDO devuelve el tenant creado y la advertencia en `advertencias`.
- [ ] La consulta al padrón deja una fila en `idn.consulta_log` del tenant con motivo `VERIFICACION_IDENTIDAD` y producto `PLAT`.
- [ ] Sin `OrgModule.register({ padronRuc })`, ORG sigue con `PadronRucNulo` y sus pruebas pasan sin cambios.
- [ ] `org` no importa `identidad` ni `identidad` importa `org` (prueba de límites sin reglas nuevas).
- [ ] `EmpresaRegistradaDto` y `TenantDadoDeAltaDto` documentan `advertencias` en OpenAPI.
- [ ] Un usuario con `PLAT_PROPIETARIO` tiene `plat.identidad.consultar` tras aplicar el manifiesto 1.17.0.
- [ ] Playwright, `admin-cliente`: al escribir un RUC conocido y salir del campo, la razón social se prellena y queda de solo lectura; con un RUC desconocido queda editable con la ayuda; con un RUC NO HABIDO se ve el hint antes de registrar y el aviso tras registrar.
- [ ] Playwright, `admin-cliente`: un usuario sin `plat.identidad.consultar` registra la empresa sin prellenado y sin errores.
- [ ] Playwright, consola: el alta con RUC NO HABIDO muestra el aviso.
- [ ] Pantallas verificadas en tema claro y oscuro y a 600 px; consola del navegador sin errores.
- [ ] El código nuevo sigue la sección «Código limpio» de `CLAUDE.md` y la estructura de libs Angular.
- [ ] `nx affected -t lint test build` verde.

## Decisiones

- **Sí:** adaptador en `apps/api`. Decisión del usuario. La app compone (como `AltaTenant`); ni `org` ni `identidad` cambian sus límites ni dependen entre sí.
- **No:** adaptador en `libs/plataforma/identidad`. Exigía `comp:idn → comp:org`, una regla nueva sin necesidad.
- **Sí:** `OrgModule.register({ padronRuc })` con nulo por defecto. Un módulo estático no deja sobrescribir el proveedor desde fuera sin `overrideProvider`, que es de pruebas.
- **Sí:** advertir si el estado no es ACTIVO o la condición no es HABIDO. Decisión del usuario (TR-RN-019 completa, no solo el literal de TR-CA-006).
- **Sí:** los textos de advertencia viven en el dominio de ORG con `DatosPadron` sin cambios. Repetir la regla «ACTIVO y HABIDO» en dos constantes cuesta menos que ampliar el puerto con un campo calculado por IDN.
- **Sí:** registrar igual: la advertencia no bloquea.
- **Sí:** `advertencias` también en el alta de tenant y aviso en la consola. Decisión del usuario.
- **Sí:** UI con prellenado y aviso en `admin-cliente`. Decisión del usuario.
- **Sí:** con padrón, manda el padrón y el campo queda de solo lectura. Decisión del usuario; es la regla que ya tiene `RegistrarEmpresa`.
- **Sí:** `plat.identidad.validar` y `consultar` a `PLAT_PROPIETARIO`. Decisión del usuario. Sin el permiso, el formulario funciona sin prellenado.
- **No:** endpoint propio de padrón en `org/empresas`. El GET del 28 ya existe con su permiso.
- **No:** guardar estado y condición en `org.empresa`. Decisión del usuario. FE consulta IDN al emitir (`apto_factura`); una foto vieja no aporta.
- **Sí:** proveedor caído o RUC no encontrado → `null`, razón social manual (TR-RNF-007).
- **Sí:** motivo `VERIFICACION_IDENTIDAD` y producto `PLAT` en la bitácora del padrón.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| En el alta de tenant, `RegistrarEmpresa` corre dentro de la transacción de `AltaTenant`: la consulta al proveedor (hasta 3 s por proveedor) retiene la conexión | El alta es rara y la hace el operador. La caché evita la llamada cuando el RUC ya se consultó (por ejemplo, en el prellenado). Si molesta, `AltaTenant` consulta el padrón antes de abrir la transacción en un spec posterior. |
| La bitácora del alta se escribe con el `tenant_id` del tenant nuevo dentro de su transacción: si el alta falla, la fila se revierte | Aceptable: la consulta del operador queda igual en la traza; la bitácora es por tenant y ese tenant no existe. |
| Decolecta sin DNI no afecta aquí, pero el RUC del plan gratuito tiene cuota mensual baja | Dev, CI y Playwright usan `IDN_PROVEEDOR=falso` con los RUC de los GWT. |
| El prellenado dispara una consulta por cada salida del campo | Solo con RUC válido y distinto del último consultado; la caché del 28 absorbe las repetidas. |
