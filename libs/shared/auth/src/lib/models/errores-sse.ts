/** El stream se cortó sin el evento final: red, cuerpo cerrado o el cierre de 15 min del back. */
export class CorteDeStream extends Error {
  constructor(options?: { cause?: unknown }) {
    super('El seguimiento se cortó', options);
    this.name = 'CorteDeStream';
  }
}

/** La API no abrió el stream: 401, 403, 404, 409 o 5xx. */
export class StreamRechazado extends Error {
  constructor(readonly estado: number) {
    super(`La API rechazó el seguimiento (${estado})`);
    this.name = 'StreamRechazado';
  }
}
