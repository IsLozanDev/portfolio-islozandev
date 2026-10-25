import { DataSource } from 'typeorm';
import { AlsTenantContext, SystemClock, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { DependenciasEntrega } from '../../src/application/dependencias-entrega.js';
import { EntregarEvento } from '../../src/application/entregar-evento.js';
import type { Manejador, RegistroSuscripciones } from '../../src/application/ports/suscripciones.js';
import { RegistrarFallo } from '../../src/application/registrar-fallo.js';
import type { EventoEntregado } from '../../src/domain/evento-entregado.js';
import { ENTIDADES_EVT } from '../../src/infrastructure/typeorm/entidades.js';
import { FallidosRepositorioTypeOrm } from '../../src/infrastructure/typeorm/fallidos.repositorio.js';
import { RegistroProcesadosTypeOrm } from '../../src/infrastructure/typeorm/registro-procesados.typeorm.js';
import { createTempDb, type TempDb } from './temp-db.js';

/** Suscripciones fijas para las pruebas: el descubrimiento con NestJS se prueba aparte. */
export class SuscripcionesEnMemoria implements RegistroSuscripciones {
  private readonly manejadores = new Map<string, Map<string, Manejador>>();

  suscribir(consumidor: string, eventType: string, manejador: Manejador): void {
    const porTipo = this.manejadores.get(consumidor) ?? new Map<string, Manejador>();
    porTipo.set(eventType, manejador);
    this.manejadores.set(consumidor, porTipo);
  }

  consumidoresDe(eventType: string): string[] {
    return [...this.manejadores].filter(([, porTipo]) => porTipo.has(eventType)).map(([consumidor]) => consumidor);
  }

  manejador(consumidor: string, eventType: string): Manejador | null {
    return this.manejadores.get(consumidor)?.get(eventType) ?? null;
  }

  consumidores(): string[] {
    return [...this.manejadores.keys()];
  }
}

export interface FilaFallido {
  consumidor: string;
  estado: string;
  intentos: number;
  error: string;
  version: string;
}

/** Pila real de la entrega: base temporal con db/ aplicado, UoW y repositorios ORM. */
export interface EntornoEntrega {
  dataSource: DataSource;
  unidadDeTrabajo: TypeOrmUnitOfWork;
  suscripciones: SuscripcionesEnMemoria;
  dependencias: DependenciasEntrega;
  entregar: EntregarEvento;
  /** La misma pila con otras suscripciones. */
  entregarCon(suscripciones: RegistroSuscripciones): EntregarEvento;
  avisos: { mensaje: string; datos: Record<string, unknown> }[];
  procesados(eventId: string): Promise<string[]>;
  fallidos(eventId: string): Promise<FilaFallido[]>;
  cerrar(): Promise<void>;
}

export async function crearEntornoEntrega(): Promise<EntornoEntrega> {
  const baseTemporal: TempDb = await createTempDb();
  const dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_EVT });
  await dataSource.initialize();
  const contexto = new AlsTenantContext();
  const unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
  const suscripciones = new SuscripcionesEnMemoria();
  const avisos: EntornoEntrega['avisos'] = [];

  const dependencias: DependenciasEntrega = {
    unidadDeTrabajo,
    contexto,
    ids: { next: uuidV7 },
    reloj: new SystemClock(),
    suscripciones,
    procesados: new RegistroProcesadosTypeOrm(unidadDeTrabajo),
    fallidos: new FallidosRepositorioTypeOrm(unidadDeTrabajo, contexto),
    avisar: (mensaje, datos) => avisos.push({ mensaje, datos }),
  };

  return {
    dataSource,
    unidadDeTrabajo,
    suscripciones,
    dependencias,
    entregar: entregarCon(dependencias),
    entregarCon: (otras) => entregarCon({ ...dependencias, suscripciones: otras }),
    avisos,
    procesados: async (eventId) =>
      (await dataSource.query(`SELECT consumidor FROM sync.evento_procesado WHERE event_id = $1 ORDER BY consumidor`, [eventId])).map(
        (fila: { consumidor: string }) => fila.consumidor,
      ),
    fallidos: (eventId) =>
      dataSource.query(`SELECT consumidor, estado, intentos, error, version FROM sync.evento_fallido WHERE event_id = $1 ORDER BY consumidor`, [
        eventId,
      ]),
    cerrar: async () => {
      await dataSource.destroy();
      await baseTemporal.drop();
    },
  };
}

function entregarCon(dependencias: DependenciasEntrega): EntregarEvento {
  return new EntregarEvento(dependencias, new RegistrarFallo(dependencias));
}

export function citaCreada(cambios: Partial<EventoEntregado> = {}): EventoEntregado {
  return {
    eventId: uuidV7(),
    seq: '1',
    tenantId: uuidV7(),
    sedeId: null,
    aggregateType: 'cita',
    aggregateId: uuidV7(),
    eventType: 'cita.creada',
    version: '1',
    origin: 'CLOUD',
    payload: { cita_id: 'c-1' },
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    ...cambios,
  };
}

/** Espera hasta que `condicion` se cumpla o vence `limiteMs`. */
export async function esperarHasta(condicion: () => Promise<boolean>, limiteMs: number): Promise<void> {
  const PAUSA_MS = 50;
  const limite = Date.now() + limiteMs;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error(`La condición no se cumplió en ${limiteMs} ms`);
    await new Promise((resolver) => setTimeout(resolver, PAUSA_MS));
  }
}
