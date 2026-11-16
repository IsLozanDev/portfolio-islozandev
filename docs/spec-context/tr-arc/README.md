# TR-ARC Archivos (MOD-11) · paquetes de contexto

Componente R2 (sprint 13, historia R2-03). Lib `libs/plataforma/archivos` (esquema `arc`, Supabase Storage solo en `infrastructure/supabase`); UI en `libs/plataforma/archivos-ui` (`<ui-archivo-carga>`). PL-10: `ARC --> FE`, `ARC --> CMS`. Retoma la expiración de 72 h de TR-RN-047 que dejaron pendiente los specs 18, 18b, 20b y 20c.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-080 | Subir archivo validado | Must | MVP | R2-03 | arc-subida-versiones-url-firmada.md | Pendiente |
| TR-RF-081 | Versionar archivo | Should | MVP | R2-03 | arc-subida-versiones-url-firmada.md | Pendiente |
| TR-RF-082 | Descargar archivo con URL firmada | Must | MVP | R2-03 | arc-subida-versiones-url-firmada.md | Pendiente |
| TR-RF-083 | Aplicar retención y bloqueo legal de archivos | Should | R2 | — (sin historia) | arc-retencion-bloqueo-legal.md | Pendiente |

Componente Angular `<ui-archivo-carga>` (hoja Componentes): sin RF ni historia propia; va en `arc-subida-versiones-url-firmada.md` (spec D).

## Orden de construcción
1. `arc-carga-descarga` (080, 082) — 9 h. Antes que TR-FE (R2-05) y que la evidencia de `per-consentimientos`.
2. `arc-antivirus` (adaptador real, TR-RNF-114) — 4 h.
3. `arc-versiones` (081) — 4 h.
4. `arc-ui-archivo-carga` — 7 h.
5. `arc-retencion-bloqueo-legal` (083 back) — 7 h, luego `arc-retencion-ui` — 6 h.
6. Opcional: `arc-exportaciones-72h` (TR-RN-047) — 6 h, solo si se abandona la exportación al vuelo de 18b/20b.

Horas: el plan da 6 h (R2-03) a 080-082 solo back y nada a 083; la partición estima 24 h para 080-082 (UI incluida) y 13 h para 083.
