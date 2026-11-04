import { CodigoMfaInvalidoError, IngresoBloqueadoError } from '../domain/errores.js';
import { cuentaParaBloqueo, DURACION_BLOQUEO_SEG, UMBRAL_FALLOS_MFA, type MotivoFalloIngreso } from '../domain/intentos-ingreso.js';
import { agenteRecortado, exigirSinBloqueo, registrarSinBloquear } from './fallos-ingreso.js';
import type { DependenciasIngreso } from './ingresar-con-clave.js';
import type { ClaveBloqueo } from './ports/contador-intentos.port.js';
import { LIMITE_PROVEEDOR, type SesionEmitida } from './ports/proveedor-ingreso.port.js';

/** El único factor configurado hoy (SMS y WebAuthn quedan fuera del spec 18b). */
const FACTOR_TOTP = 'totp';

export interface VerificacionMfa {
  usuarioId: string;
  /** Tenant del token aal1: ahí queda el LOGIN_FALLIDO. */
  tenantId: string | null;
  accessToken: string;
  factorId: string;
  codigo: string;
  ip: string;
  agente: string | null;
}

/** Segundo factor a través de la API (spec 18b): sirve para el desafío del ingreso y para confirmar el enrolamiento. */
export class VerificarMfa {
  constructor(private readonly dependencias: DependenciasIngreso) {}

  async ejecutar(verificacion: VerificacionMfa): Promise<SesionEmitida> {
    const { proveedor, contador, avisar } = this.dependencias;
    const porUsuario: ClaveBloqueo = { alcance: 'MFA', usuarioId: verificacion.usuarioId };
    await exigirSinBloqueo(contador, [porUsuario], avisar);

    const resultado = await proveedor.verificarMfa(verificacion.accessToken, verificacion.factorId, verificacion.codigo, verificacion.ip);
    if (resultado.exito) {
      await contador.limpiar(porUsuario);
      return resultado.sesion;
    }
    if (resultado.motivo === LIMITE_PROVEEDOR) {
      avisar('seg.ingreso.limite_proveedor', { etapa: 'MFA' });
      throw new IngresoBloqueadoError(resultado.reintentarEnSeg);
    }
    return this.rechazar(resultado.motivo, verificacion, porUsuario);
  }

  private async rechazar(motivo: MotivoFalloIngreso, verificacion: VerificacionMfa, porUsuario: ClaveBloqueo): Promise<never> {
    await this.registrarFallo(verificacion, { motivo });
    if (!cuentaParaBloqueo(motivo)) throw new CodigoMfaInvalidoError();

    const { bloqueadoHasta } = await this.dependencias.contador.registrarFallo(porUsuario, UMBRAL_FALLOS_MFA);
    if (!bloqueadoHasta) throw new CodigoMfaInvalidoError();
    await this.registrarFallo(verificacion, { motivo: 'BLOQUEO_MFA', hasta: bloqueadoHasta.toISOString() });
    throw new IngresoBloqueadoError(DURACION_BLOQUEO_SEG);
  }

  private registrarFallo(verificacion: VerificacionMfa, datos: Record<string, unknown>): Promise<void> {
    return registrarSinBloquear(
      this.dependencias.bitacora,
      {
        tipo: 'LOGIN_FALLIDO',
        tenantId: verificacion.tenantId,
        usuarioId: verificacion.usuarioId,
        detalle: { etapa: 'MFA', ...datos, factor: FACTOR_TOTP, agente: agenteRecortado(verificacion.agente) },
        ip: verificacion.ip,
      },
      this.dependencias.avisar,
    );
  }
}
