import { createHash } from 'node:crypto';
import type { Clock, TenantContext, TenantScope, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { DependenciasIdentidad } from '../../src/application/consultar-documento.js';
import type { CuotaPort } from '../../src/application/ports/cuota.port.js';
import type {
  BitacoraConsultas,
  CacheIdentidadRepository,
  HasherDocumento,
  RegistroConsulta,
} from '../../src/application/ports/persistencia.js';
import type {
  ConfiguracionProveedores,
  ConsultorProveedores,
  ProveedorConfigurado,
  ProveedorIdentidad,
} from '../../src/application/ports/proveedores.js';
import type { TipoConsultable } from '../../src/domain/datos-identidad.js';
import type { EntradaCache } from '../../src/domain/entrada-cache.js';
import { ProveedorFalso } from '../../src/infrastructure/falso/proveedor.falso.js';
import { ProveedorConRespaldo } from '../../src/infrastructure/respaldo/proveedor-con-respaldo.js';

export const SAL_PRUEBA = 'sal-de-prueba';

/** Mismo formato que hashDocumento de observabilidad: `sha256:` + 64 hex. */
export class HasherPrueba implements HasherDocumento {
  hashear(numero: string): string {
    return `sha256:${createHash('sha256').update(`${SAL_PRUEBA}:${numero}`).digest('hex')}`;
  }
}

export class RelojFalso implements Clock {
  constructor(public actual = new Date('2026-11-16T12:00:00Z')) {}
  now(): Date {
    return this.actual;
  }
}

export class ContextoFijo implements TenantContext {
  constructor(public alcance: TenantScope) {}
  current(): TenantScope {
    return this.alcance;
  }
  run<T>(alcance: TenantScope, trabajo: () => Promise<T>): Promise<T> {
    const anterior = this.alcance;
    this.alcance = alcance;
    return trabajo().finally(() => {
      this.alcance = anterior;
    });
  }
}

export class UnidadDeTrabajoDirecta implements UnitOfWork {
  transacciones = 0;
  run<T>(trabajo: () => Promise<T>): Promise<T> {
    this.transacciones += 1;
    return trabajo();
  }
}

export class CacheMemoria implements CacheIdentidadRepository {
  readonly entradas = new Map<string, EntradaCache>();
  async obtener(tipo: TipoConsultable, numero: string): Promise<EntradaCache | null> {
    return this.entradas.get(`${tipo}:${numero}`) ?? null;
  }
  async guardar(entrada: EntradaCache): Promise<void> {
    this.entradas.set(`${entrada.tipo}:${entrada.numero}`, entrada);
  }
}

export class BitacoraMemoria implements BitacoraConsultas {
  readonly registros: RegistroConsulta[] = [];
  async registrar(registro: RegistroConsulta): Promise<void> {
    this.registros.push(registro);
  }
}

export class CuotaEspia implements CuotaPort {
  reservas = 0;
  liberaciones = 0;
  constructor(public disponible = true) {}
  async reservar(): Promise<boolean> {
    this.reservas += 1;
    return this.disponible;
  }
  async liberar(): Promise<void> {
    this.liberaciones += 1;
  }
}

export class ConfiguracionFija implements ConfiguracionProveedores {
  constructor(public configurados: ProveedorConfigurado[]) {}
  async activosPara(): Promise<ProveedorConfigurado[]> {
    return this.configurados;
  }
}

/** Cuenta las llamadas al consultor real. */
export class ConsultorEspia implements ConsultorProveedores {
  llamadas = 0;
  constructor(private readonly consultor: ConsultorProveedores) {}
  consultar(...argumentos: Parameters<ConsultorProveedores['consultar']>) {
    this.llamadas += 1;
    return this.consultor.consultar(...argumentos);
  }
}

export const DECOLECTA: ProveedorConfigurado = { codigo: 'DECOLECTA', prioridad: 1, ttlDias: 30, timeoutMs: 3000 };
export const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
export const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
export const USUARIO = 'cccccccc-0000-4000-8000-000000000003';

export interface Dobles {
  dependencias: DependenciasIdentidad;
  reloj: RelojFalso;
  contexto: ContextoFijo;
  cache: CacheMemoria;
  bitacora: BitacoraMemoria;
  cuota: CuotaEspia;
  configuracion: ConfiguracionFija;
  consultor: ConsultorEspia;
}

export function crearDobles(proveedores: ProveedorIdentidad[] = [new ProveedorFalso()], configurados = [DECOLECTA]): Dobles {
  const reloj = new RelojFalso();
  const contexto = new ContextoFijo({ tenantId: TENANT_A, actorId: USUARIO });
  const cache = new CacheMemoria();
  const bitacora = new BitacoraMemoria();
  const cuota = new CuotaEspia();
  const configuracion = new ConfiguracionFija(configurados);
  const consultor = new ConsultorEspia(new ProveedorConRespaldo(proveedores, reloj));
  return {
    dependencias: {
      unidadDeTrabajo: new UnidadDeTrabajoDirecta(),
      contexto,
      reloj,
      cache,
      bitacora,
      configuracion,
      consultor,
      cuota,
      hasher: new HasherPrueba(),
    },
    reloj,
    contexto,
    cache,
    bitacora,
    cuota,
    configuracion,
    consultor,
  };
}
