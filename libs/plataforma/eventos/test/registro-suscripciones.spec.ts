import { Injectable } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { NombreConsumidorInvalidoError, SuscripcionDuplicadaError } from '../src/domain/errores.js';
import type { EventoEntregado } from '../src/domain/evento-entregado.js';
import { RegistroSuscripcionesNest } from '../src/interface/registro-suscripciones.nest.js';
import { SuscribirEvento } from '../src/interface/suscribir-evento.decorator.js';

/** Lo que recibió cada manejador de prueba. */
abstract class ConsumidorDePrueba {
  readonly recibidos: string[] = [];

  protected recibir(evento: EventoEntregado): Promise<void> {
    this.recibidos.push(evento.eventId);
    return Promise.resolve();
  }
}

@Injectable()
class ConsumidorPruebaA extends ConsumidorDePrueba {
  @SuscribirEvento('cita.creada', { consumidor: 'prueba-a' })
  alCrearCita(evento: EventoEntregado): Promise<void> {
    return this.recibir(evento);
  }

  @SuscribirEvento('cita.cancelada', { consumidor: 'prueba-a' })
  alCancelarCita(evento: EventoEntregado): Promise<void> {
    return this.recibir(evento);
  }

  sinSuscripcion(evento: EventoEntregado): Promise<void> {
    return this.recibir(evento);
  }
}

@Injectable()
class ConsumidorPruebaB extends ConsumidorDePrueba {
  @SuscribirEvento('cita.creada', { consumidor: 'prueba-b' })
  alCrearCita(evento: EventoEntregado): Promise<void> {
    return this.recibir(evento);
  }
}

@Injectable()
class ConsumidorDuplicado extends ConsumidorDePrueba {
  @SuscribirEvento('cita.creada', { consumidor: 'prueba-a' })
  otraVez(evento: EventoEntregado): Promise<void> {
    return this.recibir(evento);
  }
}

@Injectable()
class ConsumidorInvalido extends ConsumidorDePrueba {
  @SuscribirEvento('cita.creada', { consumidor: 'Prueba_A' })
  alCrearCita(evento: EventoEntregado): Promise<void> {
    return this.recibir(evento);
  }
}

async function iniciarCon(...consumidores: (new () => object)[]): Promise<TestingModule> {
  const modulo = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      ...consumidores,
      {
        provide: RegistroSuscripcionesNest,
        useFactory: (descubrimiento: DiscoveryService, escaner: MetadataScanner) => new RegistroSuscripcionesNest(descubrimiento, escaner),
        inject: [DiscoveryService, MetadataScanner],
      },
    ],
  }).compile();
  return modulo.init();
}

const registroDe = async (...consumidores: (new () => object)[]): Promise<RegistroSuscripcionesNest> =>
  (await iniciarCon(...consumidores)).get(RegistroSuscripcionesNest);

describe('@SuscribirEvento y RegistroSuscripcionesNest', () => {
  test('descubre los métodos suscritos de cada consumidor', async () => {
    const registro = await registroDe(ConsumidorPruebaA, ConsumidorPruebaB);

    expect(registro.consumidores()).toEqual(['prueba-a', 'prueba-b']);
    expect(registro.consumidoresDe('cita.creada')).toEqual(['prueba-a', 'prueba-b']);
    expect(registro.consumidoresDe('cita.cancelada')).toEqual(['prueba-a']);
    expect(registro.consumidoresDe('venta.registrada')).toEqual([]);
    expect(registro.manejador('prueba-b', 'cita.cancelada')).toBeNull();
  });

  test('el manejador corre sobre la instancia que creó Nest', async () => {
    const modulo = await iniciarCon(ConsumidorPruebaA);

    await modulo.get(RegistroSuscripcionesNest).manejador('prueba-a', 'cita.creada')?.({ eventId: 'e-1' } as EventoEntregado);

    expect(modulo.get(ConsumidorPruebaA).recibidos).toEqual(['e-1']);
  });

  test('el mismo consumidor suscrito dos veces al mismo tipo falla al arrancar', async () => {
    await expect(registroDe(ConsumidorPruebaA, ConsumidorDuplicado)).rejects.toThrow(SuscripcionDuplicadaError);
  });

  test('un nombre de consumidor inválido falla al arrancar', async () => {
    await expect(registroDe(ConsumidorInvalido)).rejects.toThrow(NombreConsumidorInvalidoError);
  });
});
