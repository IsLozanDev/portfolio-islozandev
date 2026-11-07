import { CredencialesInvalidasError, IngresoBloqueadoError } from '../domain/errores.js';
import {
  cuentaParaBloqueo,
  DURACION_BLOQUEO_SEG,
  enmascararCorreo,
  UMBRAL_FALLOS_CORREO_IP,
  UMBRAL_FALLOS_IP,
  type MotivoFalloIngreso,
} from '../domain/intentos-ingreso.js';
import { agenteRecortado, exigirSinBloqueo, registrarSinBloquear, type Avisar } from './fallos-ingreso.js';
import type { BitacoraIngreso, UsuarioDeIngreso } from './ports/bitacora-ingreso.port.js';
import type { AlcanceBloqueo, ClaveBloqueo, ContadorIntentos } from './ports/contador-intentos.port.js';
import { LIMITE_PROVEEDOR, type ProveedorIngreso, type SesionEmitida } from './ports/proveedor-ingreso.port.js';

export interface IngresoConClave {
  correo: string;
  clave: string;
  ip: string;
  agente: string | null;
}

export interface DependenciasIngreso {
  proveedor: ProveedorIngreso;
  contador: ContadorIntentos;
  bitacora: BitacoraIngreso;
  avisar: Avisar;
}

interface ContextoDelFallo {
  usuario: UsuarioDeIngreso | null;
  correo: string;
  ip: string;
  agente: string | null;
}

interface BloqueoAplicado {
  alcance: AlcanceBloqueo;
  hasta: Date;
}

/**
 * Ingreso con contraseña a través de la API (spec 18b). El `LOGIN` lo escribe la primera petición
 * autenticada; aquí solo los fallos y el bloqueo por correo+IP y por IP.
 */
export class IngresarConClave {
  constructor(private readonly dependencias: DependenciasIngreso) {}

  async ejecutar(ingreso: IngresoConClave): Promise<SesionEmitida> {
    const { proveedor, contador, avisar } = this.dependencias;
    const porCorreoIp: ClaveBloqueo = { alcance: 'CORREO_IP', correo: ingreso.correo, ip: ingreso.ip };
    const porIp: ClaveBloqueo = { alcance: 'IP', ip: ingreso.ip };
    await exigirSinBloqueo(contador, [porCorreoIp, porIp], avisar);

    const resultado = await proveedor.conClave(ingreso.correo, ingreso.clave, ingreso.ip);
    if (resultado.exito) {
      await contador.limpiar(porCorreoIp);
      return resultado.sesion;
    }
    if (resultado.motivo === LIMITE_PROVEEDOR) {
      avisar('seg.ingreso.limite_proveedor', { etapa: 'CLAVE' });
      throw new IngresoBloqueadoError(resultado.reintentarEnSeg);
    }
    return this.rechazar(resultado.motivo, ingreso, [porCorreoIp, porIp]);
  }

  private async rechazar(motivo: MotivoFalloIngreso, ingreso: IngresoConClave, claves: readonly ClaveBloqueo[]): Promise<never> {
    const fallo: ContextoDelFallo = {
      usuario: await this.usuarioDelCorreo(ingreso.correo),
      correo: ingreso.correo,
      ip: ingreso.ip,
      agente: agenteRecortado(ingreso.agente),
    };
    await this.registrarFallo(fallo, { motivo });
    if (!cuentaParaBloqueo(motivo)) throw new CredencialesInvalidasError();

    const bloqueos = await this.contarFallos(claves);
    if (bloqueos.length === 0) throw new CredencialesInvalidasError();
    for (const { alcance, hasta } of bloqueos) {
      await this.registrarFallo(fallo, { motivo: 'BLOQUEO_INGRESO', alcance, hasta: hasta.toISOString() });
    }
    throw new IngresoBloqueadoError(DURACION_BLOQUEO_SEG);
  }

  private async contarFallos(claves: readonly ClaveBloqueo[]): Promise<BloqueoAplicado[]> {
    const bloqueos: BloqueoAplicado[] = [];
    for (const clave of claves) {
      const umbral = clave.alcance === 'IP' ? UMBRAL_FALLOS_IP : UMBRAL_FALLOS_CORREO_IP;
      const { bloqueadoHasta } = await this.dependencias.contador.registrarFallo(clave, umbral);
      if (bloqueadoHasta) bloqueos.push({ alcance: clave.alcance, hasta: bloqueadoHasta });
    }
    return bloqueos;
  }

  /** Sin la base no se sabe el tenant: el fallo queda sin tenant, con el correo enmascarado. */
  private async usuarioDelCorreo(correo: string): Promise<UsuarioDeIngreso | null> {
    try {
      return await this.dependencias.bitacora.usuarioPorCorreo(correo);
    } catch (error) {
      this.dependencias.avisar('seg.ingreso.usuario_error', { error: error instanceof Error ? error.name : typeof error });
      return null;
    }
  }

  private registrarFallo(fallo: ContextoDelFallo, datos: Record<string, unknown>): Promise<void> {
    const correoEnmascarado = fallo.usuario ? {} : { correo: enmascararCorreo(fallo.correo) };
    return registrarSinBloquear(
      this.dependencias.bitacora,
      {
        tipo: 'LOGIN_FALLIDO',
        tenantId: fallo.usuario?.tenantId ?? null,
        usuarioId: fallo.usuario?.usuarioId ?? null,
        detalle: { etapa: 'CLAVE', ...datos, ...correoEnmascarado, agente: fallo.agente },
        ip: fallo.ip,
      },
      this.dependencias.avisar,
    );
  }
}
