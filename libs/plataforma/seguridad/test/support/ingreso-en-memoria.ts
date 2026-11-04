import type { BitacoraIngreso, EventoIngreso, UsuarioDeIngreso } from '../../src/application/ports/bitacora-ingreso.port.js';
import type { ClaveBloqueo, ContadorIntentos } from '../../src/application/ports/contador-intentos.port.js';
import type { ProveedorIngreso, ResultadoIngreso } from '../../src/application/ports/proveedor-ingreso.port.js';

const MS_POR_SEGUNDO = 1000;
const DURACION_BLOQUEO_PRUEBA_SEG = 900;

const claveTexto = (clave: ClaveBloqueo): string =>
  clave.alcance === 'MFA' ? `MFA:${clave.usuarioId}` : clave.alcance === 'IP' ? `IP:${clave.ip}` : `CORREO_IP:${clave.correo}:${clave.ip}`;

/** Mismo contrato que ContadorIntentosRedis, sin ventana de tiempo: lo que cuenta es el umbral. */
export class ContadorIntentosEnMemoria implements ContadorIntentos {
  readonly fallos = new Map<string, number>();
  readonly bloqueos = new Map<string, number>();

  constructor(private readonly ahora: () => number = Date.now) {}

  async bloqueoVigente(claves: readonly ClaveBloqueo[]): Promise<number | null> {
    const restantes = claves.map((clave) => this.bloqueos.get(claveTexto(clave)) ?? 0);
    const mayor = Math.max(...restantes);
    return mayor > 0 ? mayor : null;
  }

  async registrarFallo(clave: ClaveBloqueo, umbral: number): Promise<{ bloqueadoHasta: Date | null }> {
    const texto = claveTexto(clave);
    const fallos = (this.fallos.get(texto) ?? 0) + 1;
    if (fallos < umbral) {
      this.fallos.set(texto, fallos);
      return { bloqueadoHasta: null };
    }
    this.fallos.delete(texto);
    this.bloqueos.set(texto, DURACION_BLOQUEO_PRUEBA_SEG);
    return { bloqueadoHasta: new Date(this.ahora() + DURACION_BLOQUEO_PRUEBA_SEG * MS_POR_SEGUNDO) };
  }

  async limpiar(clave: ClaveBloqueo): Promise<void> {
    this.fallos.delete(claveTexto(clave));
  }

  fallosDe(clave: ClaveBloqueo): number {
    return this.fallos.get(claveTexto(clave)) ?? 0;
  }
}

export class BitacoraIngresoEnMemoria implements BitacoraIngreso {
  readonly eventos: EventoIngreso[] = [];
  readonly usuarios = new Map<string, UsuarioDeIngreso>();
  fallaAlEscribir = false;

  async usuarioPorCorreo(correo: string): Promise<UsuarioDeIngreso | null> {
    return this.usuarios.get(correo.trim().toLowerCase()) ?? null;
  }

  async registrar(evento: EventoIngreso): Promise<void> {
    if (this.fallaAlEscribir) throw new Error('bitácora caída');
    this.eventos.push(evento);
  }
}

/** Responde lo programado, en orden; sin programar, credenciales inválidas. */
export class ProveedorIngresoDoble implements ProveedorIngreso {
  readonly llamadas: string[] = [];
  private respuestas: Array<() => Promise<ResultadoIngreso>> = [];

  responde(...resultados: ResultadoIngreso[]): this {
    this.respuestas.push(...resultados.map((resultado) => async () => resultado));
    return this;
  }

  falla(error: Error): this {
    this.respuestas.push(async () => {
      throw error;
    });
    return this;
  }

  async conClave(correo: string): Promise<ResultadoIngreso> {
    this.llamadas.push(`clave:${correo}`);
    return this.siguiente();
  }

  async verificarMfa(_accessToken: string, factorId: string): Promise<ResultadoIngreso> {
    this.llamadas.push(`mfa:${factorId}`);
    return this.siguiente();
  }

  private siguiente(): Promise<ResultadoIngreso> {
    return (this.respuestas.shift() ?? (async () => ({ exito: false, motivo: 'CREDENCIALES' }) as const))();
  }
}
