import type { DomainEvent, TenantScope } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import type { DependenciasFeriados } from '../../src/application/feriados/dependencias-feriados.js';
import type { RepositorioFeriados } from '../../src/application/ports/feriados.js';
import { chocan } from '../../src/domain/feriados/duplicado.js';
import { SucursalNoEncontradaError } from '../../src/domain/feriados/errores.js';
import { Feriado } from '../../src/domain/feriados/feriado.js';
import { registrarEsquemasCat } from '../../src/infrastructure/event-schemas.js';
import { AHORA, CLIENTE, OPERADOR, OperadorRequeridoDoble } from './dobles.js';

export const CUSCO = '0193f3a0-0000-7000-8000-0000000a0001';
export const LIMA = '0193f3a0-0000-7000-8000-0000000a0002';
export const SUCURSAL_DEL_OPERADOR = '0193f3a0-0000-7000-8000-0000000a0009';

/** Ids de los globales que siembra el escenario, como la semilla de 01f_cat_feriado.sql. */
export const GLOBALES = {
  juevesSanto: '0193f3a0-0000-7000-8000-00000000f001',
  fiestasPatrias: '0193f3a0-0000-7000-8000-00000000f002',
  fiestasPatrias29: '0193f3a0-0000-7000-8000-00000000f003',
  angamos: '0193f3a0-0000-7000-8000-00000000f004',
} as const;

const SEMILLA: { id: string; fecha: string; nombre: string; recurrenteAnual: boolean }[] = [
  { id: GLOBALES.juevesSanto, fecha: '2026-04-02', nombre: 'Jueves Santo', recurrenteAnual: false },
  { id: GLOBALES.fiestasPatrias, fecha: '2026-07-28', nombre: 'Fiestas Patrias', recurrenteAnual: true },
  { id: GLOBALES.fiestasPatrias29, fecha: '2026-07-29', nombre: 'Fiestas Patrias', recurrenteAnual: true },
  { id: GLOBALES.angamos, fecha: '2026-10-08', nombre: 'Combate de Angamos', recurrenteAnual: true },
];

/** Sucursales de cada tenant: lo que comprueba la FK compuesta. */
const SUCURSALES: Record<string, readonly string[]> = { [CLIENTE]: [CUSCO, LIMA], [OPERADOR]: [SUCURSAL_DEL_OPERADOR] };

/** Como cat.feriado con la RLS: globales y del tenant actual; los globales solo por las funciones DEFINER. */
export class FeriadosEnMemoria implements RepositorioFeriados {
  readonly filas = new Map<string, Feriado>();
  escrituras = 0;

  constructor(private readonly tenantActual: () => string) {}

  async buscar(id: string) {
    const feriado = this.filas.get(id);
    return feriado && this.visible(feriado) ? feriado : null;
  }

  async choca(feriado: Feriado, excluirId: string | null) {
    return [...this.filas.values()].some((existente) => existente.id !== excluirId && this.visible(existente) && chocan(feriado, existente));
  }

  async guardarDelTenant(feriado: Feriado, versionAnterior: number | null) {
    if (feriado.tenantId !== this.tenantActual()) return false;
    if (feriado.sucursalId !== null && !SUCURSALES[this.tenantActual()]?.includes(feriado.sucursalId)) throw new SucursalNoEncontradaError();
    return this.escribir(feriado, versionAnterior);
  }

  async eliminarDelTenant(id: string, version: number) {
    const guardado = this.filas.get(id);
    if (!guardado || guardado.esGlobal || guardado.tenantId !== this.tenantActual()) return false;
    return this.borrar(guardado, version);
  }

  async guardarGlobal(feriado: Feriado, versionAnterior: number | null) {
    if (!feriado.esGlobal) return false;
    return this.escribir(feriado, versionAnterior);
  }

  async eliminarGlobal(id: string, version: number) {
    const guardado = this.filas.get(id);
    if (!guardado?.esGlobal) return false;
    return this.borrar(guardado, version);
  }

  async delAnio(anio: number, sucursalId: string | null) {
    return [...this.filas.values()].filter(
      (feriado) =>
        this.visible(feriado) &&
        (sucursalId === null || feriado.sucursalId === null || feriado.sucursalId === sucursalId) &&
        (feriado.recurrenteAnual ? feriado.anio <= anio : feriado.anio === anio),
    );
  }

  sembrarGlobales(): void {
    for (const { id, fecha, nombre, recurrenteAnual } of SEMILLA) {
      this.filas.set(id, reconstituirCon(Feriado.crear({ id, alcance: 'GLOBAL', tenantId: null, sucursalId: null, fecha, nombre, recurrenteAnual, por: OPERADOR, ahora: AHORA }), 0));
    }
  }

  private visible(feriado: Feriado): boolean {
    return feriado.tenantId === null || feriado.tenantId === this.tenantActual();
  }

  private escribir(feriado: Feriado, versionAnterior: number | null): boolean {
    const guardado = this.filas.get(feriado.id);
    if (versionAnterior !== null && guardado?.version !== versionAnterior) return false;
    this.escrituras += 1;
    this.filas.set(feriado.id, reconstituirCon(feriado, versionAnterior === null ? 0 : versionAnterior + 1));
    return true;
  }

  private borrar(guardado: Feriado, version: number): boolean {
    if (guardado.version !== version) return false;
    this.escrituras += 1;
    this.filas.delete(guardado.id);
    return true;
  }
}

function reconstituirCon(feriado: Feriado, version: number): Feriado {
  return Feriado.reconstituir(feriado.id, version, {
    alcance: feriado.alcance,
    tenantId: feriado.tenantId,
    sucursalId: feriado.sucursalId,
    fecha: feriado.fecha,
    nombre: feriado.nombre,
    recurrenteAnual: feriado.recurrenteAnual,
    creadoPor: feriado.creadoPor,
    creadoEn: feriado.creadoEn,
    modificadoPor: feriado.modificadoPor,
    modificadoEn: feriado.modificadoEn,
  });
}

export interface EscenarioFeriados {
  dependencias: DependenciasFeriados;
  feriados: FeriadosEnMemoria;
  publicados: DomainEvent[];
  /** Cambia el tenant del contexto (el cliente por defecto). */
  comoTenant(tenantId: string): void;
}

/** Cliente con Cusco y Lima, y la semilla de globales. Los eventos se validan contra su esquema al publicar. */
export function escenarioFeriados(): EscenarioFeriados {
  let alcance: TenantScope = { tenantId: CLIENTE };
  const feriados = new FeriadosEnMemoria(() => alcance.tenantId);
  feriados.sembrarGlobales();
  const publicados: DomainEvent[] = [];
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasCat(validador);
  const enTransaccion = { activa: false };
  let siguienteId = 0;

  const dependencias: DependenciasFeriados = {
    unidadDeTrabajo: {
      run: async (trabajo) => {
        enTransaccion.activa = true;
        try {
          return await trabajo();
        } finally {
          enTransaccion.activa = false;
        }
      },
    },
    contexto: { current: () => alcance, run: (_alcance, trabajo) => trabajo() },
    ids: { next: () => `0193f3a0-0000-7000-8000-00000000e${String(++siguienteId).padStart(3, '0')}` },
    reloj: { now: () => AHORA },
    eventos: {
      publish: async (evento) => {
        if (!enTransaccion.activa) throw new Error('el evento debía publicarse dentro de la transacción');
        validador.validate(evento);
        publicados.push(evento);
      },
    },
    feriados,
    verificadorOperador: {
      exigir: async (tenantId) => {
        if (tenantId !== OPERADOR) throw new OperadorRequeridoDoble('Solo el tenant operador puede administrar catálogos globales');
      },
    },
  };

  return {
    dependencias,
    feriados,
    publicados,
    comoTenant: (tenantId) => {
      alcance = { tenantId };
    },
  };
}
