# TR-REP · Reportes y tableros (MOD-14)

Paquetes de contexto para los specs de TR-REP. No son specs: `/spec` los usa como insumo y asigna el número.

## Checklist de RF
| RF | Nombre | Prioridad | Fase SRS | Historia | Archivo | Estado |
|---|---|---|---|---|---|---|
| TR-RF-096 | Registrar definiciones de reportes | Must | MVP | R3-04 (sprint 20) | `rep-definiciones-ejecucion-exportacion.md` | Contexto listo |
| TR-RF-097 | Ejecutar y exportar reporte | Must | MVP | R3-04 (sprint 20) | `rep-definiciones-ejecucion-exportacion.md` | Contexto listo |
| TR-RF-098 | Programar envío de reportes | Should | R2 | Sin historia | `rep-programacion-tableros.md` | Contexto listo; fuera del plan |
| TR-RF-099 | Configurar tableros por rol | Should | MVP | Sin historia | `rep-programacion-tableros.md` | Contexto listo; fuera del plan |

## Orden de construcción
1. `rep-definiciones-motor` (096 + 097 síncrono). Requiere 06/07, 20a.
2. `rep-exportacion-asincrona` (097 exportación, segundo plano, permiso de datos personales). Requiere TR-ARC (R2-03) y TR-NOT (R2-09).
3. `rep-ui-admin` (UI en `admin-cliente`).
4. Solo si se agregan al backlog: `rep-tableros-back`, `rep-tableros-ui` (099) y `rep-programacion-envios` (098). Los widgets KPI conviene hacerlos después de `obs-indicadores-reglas`.

Notas:
- PL-10 no dibuja TR-REP y `eslint.config.mjs` no tiene `comp:rep`: el primer spec lo agrega.
- El plan da 8 h a R3-04; la estimación realista es unas 20 h en tres specs.
- Las exportaciones XLSX de 18b (bitácora) y 20b (auditoría) son antecedente: mismo patrón y candidato a un escritor común.
