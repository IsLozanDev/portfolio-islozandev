import type { EntradaAmr, Principal } from '../domain/principal.js';
import { agenteRecortado, type Avisar } from './fallos-ingreso.js';
import type { BitacoraIngreso } from './ports/bitacora-ingreso.port.js';
import type { RegistroSesiones } from './ports/registro-sesiones.port.js';

export interface InicioDeSesion {
  principal: Principal;
  ip: string | null;
  agente: string | null;
}

export interface DependenciasInicioSesion {
  sesiones: RegistroSesiones;
  bitacora: BitacoraIngreso;
  avisar: Avisar;
}

/** El método con que se obtuvo la sesión: la entrada más reciente de `amr` (password, oauth, otp, totp…). */
function metodoDe(amr: readonly EntradaAmr[]): string | null {
  const masReciente = amr.reduce<EntradaAmr | null>((elegida, entrada) => (!elegida || entrada.timestamp > elegida.timestamp ? entrada : elegida), null);
  return masReciente?.method ?? null;
}

/**
 * `LOGIN` en la primera petición de cada sesión de Supabase (spec 18b): cubre contraseña, Google y
 * enlaces sin tocar esos flujos. AutenticacionGuard no lo espera y un fallo nunca afecta a la petición.
 */
export class RegistrarInicioSesion {
  constructor(private readonly dependencias: DependenciasInicioSesion) {}

  async ejecutar({ principal, ip, agente }: InicioDeSesion): Promise<void> {
    const { sesiones, bitacora, avisar } = this.dependencias;
    try {
      if (!(await sesiones.esNueva(principal.sesionId))) return;
      await bitacora.registrar({
        tipo: 'LOGIN',
        tenantId: principal.tenantId,
        usuarioId: principal.usuarioId,
        detalle: { sesion_id: principal.sesionId, metodo: metodoDe(principal.amr), aal: principal.aal, agente: agenteRecortado(agente) },
        ip,
      });
    } catch (error) {
      // Con la sesión ya marcada, el LOGIN de esta sesión se pierde: borrarla podría duplicarlo (Riesgos del spec).
      avisar('seg.login.error', { error: error instanceof Error ? error.name : typeof error });
    }
  }
}
