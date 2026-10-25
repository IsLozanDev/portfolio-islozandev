import type { OnModuleInit } from '@nestjs/common';
import type { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { Manejador, RegistroSuscripciones } from '../application/ports/suscripciones.js';
import { SuscripcionDuplicadaError } from '../domain/errores.js';
import { NombreConsumidor } from '../domain/nombre-consumidor.js';
import { SUSCRIPCION, type Suscripcion } from './suscribir-evento.decorator.js';

/** Recorre los providers al iniciar el módulo y registra cada método con `@SuscribirEvento`. */
export class RegistroSuscripcionesNest implements RegistroSuscripciones, OnModuleInit {
  /** consumidor → event_type → manejador. */
  private readonly manejadores = new Map<string, Map<string, Manejador>>();

  constructor(
    private readonly descubrimiento: DiscoveryService,
    private readonly escaner: MetadataScanner,
  ) {}

  onModuleInit(): void {
    for (const proveedor of this.descubrimiento.getProviders()) {
      const instancia: unknown = proveedor.instance;
      if (!proveedor.isDependencyTreeStatic() || typeof instancia !== 'object' || instancia === null) continue;
      for (const metodo of this.escaner.getAllMethodNames(Object.getPrototypeOf(instancia))) {
        const suscripcion = this.descubrimiento.getMetadataByDecorator(SUSCRIPCION, proveedor, metodo);
        if (suscripcion) this.registrar(suscripcion, manejadorDe(instancia, metodo));
      }
    }
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

  private registrar({ eventType, consumidor }: Suscripcion, manejador: Manejador): void {
    // Valida al arrancar: un nombre que no sirve de cola rompe el inicio, no la primera entrega.
    NombreConsumidor.de(consumidor);
    const porTipo = this.manejadores.get(consumidor) ?? new Map<string, Manejador>();
    if (porTipo.has(eventType)) throw new SuscripcionDuplicadaError(consumidor, eventType);
    porTipo.set(eventType, manejador);
    this.manejadores.set(consumidor, porTipo);
  }
}

function manejadorDe(instancia: object, metodo: string): Manejador {
  const funcion = (instancia as Record<string, Manejador>)[metodo];
  return funcion.bind(instancia);
}
