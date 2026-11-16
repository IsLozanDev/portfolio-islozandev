# TR-IDN Identidad e interoperabilidad (MOD-07) · paquetes de contexto

Componente R2 (sprint 13, historia R2-02) para el nivel 1 (DNI/RUC con caché, proveedor, cuota). El nivel 3 (identidad portable, RF 048-051) es R4 según el plan. Lib `libs/plataforma/identidad` (esquema `idn`); consola en `libs/plataforma/consola-identidad`. Reemplaza el `PadronRucNulo` que dejó el spec 03 en `libs/plataforma/org`.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-044 | Validar formato de DNI y RUC | Must | MVP | R2-02 | idn-validacion-consulta-dni-ruc.md | Pendiente |
| TR-RF-045 | Consultar DNI con caché y proveedor | Must | MVP | R2-02 | idn-validacion-consulta-dni-ruc.md | Pendiente |
| TR-RF-046 | Consultar RUC con estado y condición | Must | MVP | R2-02 | idn-validacion-consulta-dni-ruc.md | Pendiente |
| TR-RF-047 | Controlar cuota de consultas por plan | Must | MVP | R2-02 | idn-cuota-y-consola-proveedor.md | Pendiente |
| TR-RF-048 | Solicitar autorización de identidad portable | Should | R2 (plan: R4) | — | idn-identidad-portable.md | Pendiente |
| TR-RF-049 | Confirmar autorización con código | Should | R2 (plan: R4) | — | idn-identidad-portable.md | Pendiente |
| TR-RF-050 | Entregar datos autorizados y registrar acceso | Should | R2 (plan: R4) | — | idn-identidad-portable.md | Pendiente |
| TR-RF-051 | Revocar autorizaciones y ver accesos del titular | Should | R2 (plan: R4) | — | idn-identidad-portable.md | Pendiente |

Pantalla de consola "Proveedor DNI/RUC y cuotas" (plan 6.1, R2): sin RF ni historia propia; va en `idn-cuota-y-consola-proveedor.md`.

## Orden de construcción
1. `idn-validacion-consulta` (044-046) — 10 h. Puede ir antes que TR-PER aunque PL-10 dibuje `PER --> IDN`: PER y ORG lo consumen.
2. `idn-cuota` (047 back) — 6 h.
3. `idn-consola-proveedor-cuotas` (UI) — 8 h; tras 17b y 17c.
4. R4, solo si se prioriza: `idn-portable-titular-y-solicitud` (048), `idn-portable-confirmacion-y-lectura` (049, 050), `idn-portable-mis-autorizaciones` (051); requieren TR-NOT y TR-POR.

Horas: el plan da 7 h (R2-02) a 044-047 solo back; la partición estima 16 h de back y 8 h de UI.
