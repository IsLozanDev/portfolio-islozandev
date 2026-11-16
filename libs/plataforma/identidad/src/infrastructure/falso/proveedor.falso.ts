import type { DatosDni, DatosRuc } from '../../domain/datos-identidad.js';
import type { ProveedorIdentidad } from '../../application/ports/proveedores.js';
import { DNIS_FALSOS, RUCS_FALSOS } from './fixtures.js';

export const CODIGO_PROVEEDOR_POR_DEFECTO = 'DECOLECTA';

export interface OpcionesProveedorFalso {
  /** Código de idn.proveedor bajo el que responde. */
  codigo?: string;
  demoraMs?: number;
  falla?: boolean;
}

export class ProveedorFalloError extends Error {
  constructor(codigo: string) {
    super(`El proveedor falso ${codigo} está configurado para fallar`);
  }
}

function esperar(milisegundos: number, señal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(resolver, milisegundos);
    señal.addEventListener(
      'abort',
      () => {
        clearTimeout(temporizador);
        rechazar(señal.reason);
      },
      { once: true },
    );
  });
}

/** Para local, CI y staging: responde con fixtures, con demora y fallo configurables. */
export class ProveedorFalso implements ProveedorIdentidad {
  readonly codigo: string;
  private readonly demoraMs: number;
  private readonly falla: boolean;

  constructor({ codigo = CODIGO_PROVEEDOR_POR_DEFECTO, demoraMs = 0, falla = false }: OpcionesProveedorFalso = {}) {
    this.codigo = codigo;
    this.demoraMs = demoraMs;
    this.falla = falla;
  }

  async consultarDni(numero: string, señal: AbortSignal): Promise<DatosDni | null> {
    await this.simularLlamada(señal);
    return DNIS_FALSOS[numero] ?? null;
  }

  async consultarRuc(numero: string, señal: AbortSignal): Promise<DatosRuc | null> {
    await this.simularLlamada(señal);
    return RUCS_FALSOS[numero] ?? null;
  }

  private async simularLlamada(señal: AbortSignal): Promise<void> {
    if (this.demoraMs > 0) await esperar(this.demoraMs, señal);
    if (this.falla) throw new ProveedorFalloError(this.codigo);
  }
}
