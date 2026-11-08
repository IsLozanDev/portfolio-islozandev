import type { DomainEvent, TenantScope } from '@vitrina/plataforma/kernel';
import { InMemoryEventSchemaValidator } from '@vitrina/plataforma/kernel-infra';
import type { DependenciasCalendario } from '../../src/application/feriados/dependencias-calendario.js';
import type { DependenciasFeriados } from '../../src/application/feriados/dependencias-feriados.js';
import type { ParametrosCalendario } from '../../src/application/ports/calendario.port.js';
import type { LecturaCalendario, RepositorioFeriados } from '../../src/application/ports/feriados.js';
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

/** Como cat.fechas_feriado: globales, del tenant actual y de la sucursal pedida, con los recurrentes proyectados. */
export class LecturaCalendarioEnMemoria implements LecturaCalendario {
  readonly lecturas: { desde: string; hasta: string; sucursalId: string | null }[] = [];

  constructor(
    private readonly feriados: FeriadosEnMemoria,
    private readonly tenantActual: () => string,
  ) {}

  async fechasFeriado(desde: string, hasta: string, sucursalId: string | null) {
    this.lecturas.push({ desde, hasta, sucursalId });
    const anioDesde = Number(desde.slice(0, 4));
    const anios = Array.from({ length: Number(hasta.slice(0, 4)) - anioDesde + 1 }, (_, indice) => anioDesde + indice);
    const fechas = new Set<string>();
    for (const feriado of this.feriados.filas.values()) {
      if (!this.aplica(feriado, sucursalId)) continue;
      for (const anio of anios) {
        const fecha = feriado.fechaEnAnio(anio);
        if (fecha !== null && fecha >= desde && fecha <= hasta) fechas.add(fecha);
      }
    }
    return [...fechas].sort();
  }

  private aplica(feriado: Feriado, sucursalId: string | null): boolean {
    if (feriado.esGlobal) return true;
    return feriado.tenantId === this.tenantActual() && (feriado.sucursalId === null || feriado.sucursalId === sucursalId);
  }
}

/** `sabado_habil` fijado por sucursal; sin valor fijado, el defecto true. */
export class ParametrosCalendarioDoble implements ParametrosCalendario {
  readonly porSucursal = new Map<string, boolean>();
  readonly consultas: (string | null)[] = [];

  async sabadoHabil(sucursalId: string | null) {
    this.consultas.push(sucursalId);
    return (sucursalId !== null ? this.porSucursal.get(sucursalId) : undefined) ?? true;
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
  calendario: DependenciasCalendario;
  lectura: LecturaCalendarioEnMemoria;
  parametros: ParametrosCalendarioDoble;
  /** Sucursal del contexto (X-Sucursal-Id); ninguna por defecto. */
  enSucursal(sucursalId: string | undefined): void;
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

  const lectura = new LecturaCalendarioEnMemoria(feriados, () => alcance.tenantId);
  const parametros = new ParametrosCalendarioDoble();
  const calendario: DependenciasCalendario = { unidadDeTrabajo: dependencias.unidadDeTrabajo, contexto: dependencias.contexto, lectura, parametros };

  return {
    dependencias,
    calendario,
    lectura,
    parametros,
    feriados,
    publicados,
    comoTenant: (tenantId) => {
      alcance = { tenantId, branchId: alcance.branchId };
    },
    enSucursal: (sucursalId) => {
      alcance = { tenantId: alcance.tenantId, branchId: sucursalId };
    },
  };
}
