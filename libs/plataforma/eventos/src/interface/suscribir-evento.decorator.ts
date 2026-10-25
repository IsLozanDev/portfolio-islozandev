import type { CustomDecorator } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

export interface Suscripcion {
  eventType: string;
  consumidor: string;
}

export const SUSCRIPCION = DiscoveryService.createDecorator<Suscripcion>();

/**
 * Suscribe un método de un provider a un tipo de evento (TR-RF-093). Entrega al menos una vez: el método
 * corre en la transacción de la entrega, con el tenant del evento, y una reentrega del mismo `event_id`
 * no lo vuelve a llamar. Un efecto fuera de la base (correo, HTTP) puede repetirse si la transacción
 * revierte después: debe ser idempotente por `event_id` por sí mismo.
 *
 * `consumidor` es la clave estable de la cola y de la idempotencia: cambiarlo equivale a un consumidor nuevo.
 */
export function SuscribirEvento(eventType: string, opciones: { consumidor: string }): CustomDecorator {
  return SUSCRIPCION({ eventType, consumidor: opciones.consumidor });
}
