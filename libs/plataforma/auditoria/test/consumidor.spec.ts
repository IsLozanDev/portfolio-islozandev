import 'reflect-metadata';
import type { EventoEntregado } from '@vitrina/plataforma/eventos';
import type { AuditarEventoDePlataforma } from '../src/application/auditar-evento-de-plataforma.js';
import { AuditoriaConsumidor, EVENTOS_AUDITADOS } from '../src/interface/auditoria.consumidor.js';

interface Suscripcion {
  eventType: string;
  consumidor: string;
}

type Metodo = (evento: EventoEntregado) => Promise<void>;

function suscripcionesDe(prototipo: object): Map<string, Suscripcion> {
  const suscripciones = new Map<string, Suscripcion>();
  for (const nombre of Object.getOwnPropertyNames(prototipo)) {
    const metodo = (prototipo as Record<string, unknown>)[nombre];
    const suscripcion = typeof metodo === 'function' ? suscripcionDe(metodo) : undefined;
    if (suscripcion) suscripciones.set(nombre, suscripcion);
  }
  return suscripciones;
}

/** @SuscribirEvento guarda `{ eventType, consumidor }` con una clave privada de eventos: se busca por la forma. */
function suscripcionDe(metodo: object): Suscripcion | undefined {
  return Reflect.getMetadataKeys(metodo)
    .map((clave) => Reflect.getMetadata(clave, metodo) as Partial<Suscripcion> | undefined)
    .find((valor): valor is Suscripcion => typeof valor?.eventType === 'string' && typeof valor.consumidor === 'string');
}

describe('AuditoriaConsumidor (spec 20a)', () => {
  const suscripciones = suscripcionesDe(AuditoriaConsumidor.prototype);

  it('suscribe el consumidor auditoria a cada tipo de EVENTOS_AUDITADOS, una vez cada uno', () => {
    const tipos = [...suscripciones.values()].map((suscripcion) => suscripcion.eventType);
    expect([...tipos].sort()).toEqual([...EVENTOS_AUDITADOS].sort());
    expect(new Set(tipos).size).toBe(tipos.length);
    expect([...suscripciones.values()].every((suscripcion) => suscripcion.consumidor === 'auditoria')).toBe(true);
  });

  it('no audita seq.numero.emitido ni suscripcion.por_vencer', () => {
    expect(EVENTOS_AUDITADOS).not.toContain('seq.numero.emitido');
    expect(EVENTOS_AUDITADOS).not.toContain('suscripcion.por_vencer');
  });

  it('cada método entrega su evento a AuditarEventoDePlataforma', async () => {
    const auditados: EventoEntregado[] = [];
    const auditar = { ejecutar: async (evento: EventoEntregado) => void auditados.push(evento) } as unknown as AuditarEventoDePlataforma;
    const consumidor = new AuditoriaConsumidor(auditar);
    for (const [nombre, { eventType }] of suscripciones) {
      const metodo = (consumidor as unknown as Record<string, Metodo>)[nombre];
      await metodo.call(consumidor, { eventType } as EventoEntregado);
    }
    expect(auditados.map((evento) => evento.eventType).sort()).toEqual([...EVENTOS_AUDITADOS].sort());
  });
});
