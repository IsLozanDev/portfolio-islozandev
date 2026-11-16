# TR-PER Personas (MOD-06) · paquetes de contexto

Componente R2 (sprint 13, historia R2-01; fusión en R2-12, sprint 16). Lib `libs/plataforma/personas` (esquema `per`); UI en `libs/plataforma/personas-ui` y `admin-cliente`. PL-10: `CAT --> PER --> IDN`, `PER --> FE`, `PER --> POR`.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-039 | Registrar persona con documento | Must | MVP | R2-01 | per-registro-roles-contactos.md | Pendiente |
| TR-RF-040 | Asignar rol de persona por producto | Must | MVP | R2-01 | per-registro-roles-contactos.md | Pendiente |
| TR-RF-041 | Gestionar contactos y direcciones | Must | MVP | R2-01 | per-registro-roles-contactos.md | Pendiente |
| TR-RF-042 | Detectar y fusionar personas duplicadas | Should | R2 | R2-12 (con CC-06) | per-duplicados-fusion.md | Pendiente |
| TR-RF-043 | Registrar consentimientos de la persona | Must | MVP | R2-01 | per-consentimientos.md | Pendiente |

Componente Angular `<ui-persona-buscador>` (hoja Componentes): sin RF ni historia propia; va en `per-registro-roles-contactos.md` (spec C).

## Orden de construcción
1. `idn-validacion-consulta` (paquete `tr-idn/`), o puerto `IdentidadPort` nulo si PER va antes (ver P1 del paquete de registro).
2. `per-registro-y-roles` (039, 040) — 9 h.
3. `per-contactos-direcciones` (041) — 5 h.
4. `per-consentimientos` (043) — 7 h; la validación de evidencia espera a `arc-subida-descarga`.
5. `per-ui-persona-buscador` (UI 039/041) — 8 h; opcional `per-textos-finalidad-ui` — 5 h.
6. `per-duplicados-fusion` (042 back) — 7 h, luego `per-fusion-ui` — 6 h; antes de CC-06 de SazónPOS.

Horas: el plan asigna 7 h (R2-01) a 039-041 y 043 solo en back; la partición estima unas 29 h de back y 13-19 h de UI. Revisar la capacidad de los sprints 13 y 16.
