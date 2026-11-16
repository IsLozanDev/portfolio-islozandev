import type { Clock } from '@vitrina/plataforma/kernel';
import type { DocumentoConDatos, TipoConsultable } from '../../domain/datos-identidad.js';
import type {
  ConsultorProveedores,
  ProveedorConfigurado,
  ProveedorIdentidad,
  RespuestaProveedores,
} from '../../application/ports/proveedores.js';
import { CircuitBreaker } from './circuit-breaker.js';

export type CrearSeñalConLimite = (milisegundos: number) => AbortSignal;

const NO_DISPONIBLE: RespuestaProveedores = { resultado: 'NO_DISPONIBLE' };

/** Rechaza en cuanto la señal se aborta, aunque el proveedor la ignore. */
function cortarAlAbortar<T>(operacion: Promise<T>, señal: AbortSignal): Promise<T> {
  const aborto = new Promise<never>((_resolver, rechazar) => {
    if (señal.aborted) rechazar(señal.reason);
    señal.addEventListener('abort', () => rechazar(señal.reason), { once: true });
  });
  return Promise.race([operacion, aborto]);
}

async function consultarSegunTipo(
  proveedor: ProveedorIdentidad,
  tipo: TipoConsultable,
  numero: string,
  señal: AbortSignal,
): Promise<DocumentoConDatos | null> {
  if (tipo === 'DNI') {
    const datos = await proveedor.consultarDni(numero, señal);
    return datos && { tipo, datos };
  }
  const datos = await proveedor.consultarRuc(numero, señal);
  return datos && { tipo, datos };
}

/**
 * TR-RNF-007: prueba los proveedores por prioridad. Error, timeout o breaker abierto pasan al siguiente;
 * `null` es una respuesta válida (no existe) y corta el recorrido.
 */
export class ProveedorConRespaldo implements ConsultorProveedores {
  private readonly proveedores: ReadonlyMap<string, ProveedorIdentidad>;
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(
    proveedores: ProveedorIdentidad[],
    private readonly reloj: Clock,
    private readonly crearSeñalConLimite: CrearSeñalConLimite = (milisegundos) => AbortSignal.timeout(milisegundos),
  ) {
    this.proveedores = new Map(proveedores.map((proveedor) => [proveedor.codigo, proveedor]));
  }

  async consultar(tipo: TipoConsultable, numero: string, configurados: ProveedorConfigurado[]): Promise<RespuestaProveedores> {
    for (const configurado of configurados) {
      const respuesta = await this.intentar(tipo, numero, configurado);
      if (respuesta) return respuesta;
    }
    return NO_DISPONIBLE;
  }

  private async intentar(
    tipo: TipoConsultable,
    numero: string,
    configurado: ProveedorConfigurado,
  ): Promise<RespuestaProveedores | null> {
    const proveedor = this.proveedores.get(configurado.codigo);
    const breaker = this.breakerDe(configurado.codigo);
    if (!proveedor || !breaker.permiteLlamada()) return null;

    const señal = this.crearSeñalConLimite(configurado.timeoutMs);
    try {
      const documento = await cortarAlAbortar(consultarSegunTipo(proveedor, tipo, numero, señal), señal);
      breaker.registrarExito();
      if (!documento) return { resultado: 'NO_ENCONTRADO', proveedor: configurado };
      return { resultado: 'ENCONTRADO', documento, proveedor: configurado };
    } catch {
      breaker.registrarFallo();
      return null;
    }
  }

  private breakerDe(codigo: string): CircuitBreaker {
    const existente = this.breakers.get(codigo);
    if (existente) return existente;
    const nuevo = new CircuitBreaker(this.reloj);
    this.breakers.set(codigo, nuevo);
    return nuevo;
  }
}
