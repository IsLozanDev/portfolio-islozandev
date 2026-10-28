import { ConflictError, type AggregateRoot } from '@vitrina/plataforma/kernel';

export class VersionObsoletaError extends ConflictError {
  override readonly code = 'VERSION_OBSOLETA';

  constructor() {
    super('El registro cambió desde que lo abrió; recargue y vuelva a intentar');
  }
}

/** La edición se hizo sobre lo que el cliente leyó: si cambió desde entonces, no se pisa (TR-RNF-008). */
export function exigirVersion(agregado: AggregateRoot, versionLeida: number): void {
  if (agregado.version !== versionLeida) throw new VersionObsoletaError();
}
