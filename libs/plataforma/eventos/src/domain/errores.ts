import { ConflictError, ValidationError } from '@vitrina/plataforma/kernel';

export class NombreConsumidorInvalidoError extends ValidationError {
  override readonly code = 'CONSUMIDOR_INVALIDO';

  constructor(nombre: string) {
    super(`El consumidor «${nombre}» debe tener de 3 a 40 minúsculas, dígitos o guiones y empezar con letra`);
  }
}

export class IntentosInvalidosError extends ValidationError {
  override readonly code = 'INTENTOS_INVALIDOS';

  constructor() {
    super('Los intentos de un fallo deben ser un entero mayor que 0');
  }
}

export class EventoNoFallidoError extends ConflictError {
  override readonly code = 'NO_FALLIDO';

  constructor() {
    super('Solo se reprocesa un evento en estado FALLIDO');
  }
}

export class SuscripcionDuplicadaError extends ConflictError {
  override readonly code = 'SUSCRIPCION_DUPLICADA';

  constructor(consumidor: string, eventType: string) {
    super(`El consumidor «${consumidor}» ya está suscrito a ${eventType}`);
  }
}
