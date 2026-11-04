import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { LecturaSoporte, SesionSoporte } from './ports/lectura-soporte.js';
import type { PermisosRepositorio } from './ports/permisos.port.js';

/** Igual que los permisos (TR-RNF-101). La caducidad real es `hasta`, que se compara en cada llamada. */
export const TTL_SOPORTE_SEG = 60;
/** Tope de entradas: al pasarlo se vacía. Una instancia hoy; Redis compartido queda fuera (spec 18). */
const ENTRADAS_MAXIMAS = 10_000;
const MILISEGUNDOS_POR_SEGUNDO = 1000;

interface EntradaEnCache {
  sesion: SesionSoporte | null;
  guardadaEn: number;
}

export interface DependenciasResolverSoporte {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  lectura: Pick<LecturaSoporte, 'vigenteDe'>;
  versiones: Pick<PermisosRepositorio, 'versiones'>;
  reloj: Clock;
}

/**
 * Acceso de soporte vigente del usuario en el tenant, o null. La clave lleva la versión de seguridad
 * del tenant: aprobar, revocar y vencer cambian la membresía y suben `vt` al commit, así que la entrada
 * vieja deja de leerse. El corte por `hasta` es exacto aunque la entrada siga en caché.
 */
export class ResolverAccesoSoporteVigente {
  private readonly cache = new Map<string, EntradaEnCache>();

  constructor(private readonly dependencias: DependenciasResolverSoporte) {}

  ejecutar(usuarioId: string, tenantId: string): Promise<SesionSoporte | null> {
    const { contexto, unidadDeTrabajo, versiones, lectura, reloj } = this.dependencias;
    return contexto.run({ tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const ahora = reloj.now();
        const { vt } = await versiones.versiones(tenantId);
        const clave = `soporte:${tenantId}:${vt}:${usuarioId}`;
        const enCache = this.cache.get(clave);
        if (enCache && ahora.getTime() - enCache.guardadaEn < TTL_SOPORTE_SEG * MILISEGUNDOS_POR_SEGUNDO) return vigenteEn(enCache.sesion, ahora);

        const sesion = await lectura.vigenteDe(usuarioId, ahora);
        this.guardar(clave, { sesion, guardadaEn: ahora.getTime() });
        return sesion;
      }),
    );
  }

  private guardar(clave: string, entrada: EntradaEnCache): void {
    if (this.cache.size >= ENTRADAS_MAXIMAS) this.cache.clear();
    this.cache.set(clave, entrada);
  }
}

function vigenteEn(sesion: SesionSoporte | null, ahora: Date): SesionSoporte | null {
  return sesion && ahora < sesion.hasta ? sesion : null;
}
