import type { ParPersonas } from '../../domain/duplicados.js';
import type { CamposElegidos } from '../../domain/fusion.js';

/** Fila de `per.fusion`: el registro histórico, de solo inserción. */
export interface RegistroFusion {
  id: string;
  conservadaId: string;
  absorbidaId: string;
  camposElegidos: CamposElegidos;
  motivo: string;
  fusionadoPor: string;
  fusionadoEn: Date;
}

/** Fusiones y pares descartados del tenant del contexto. */
export interface RepositorioFusiones {
  registrar(fusion: RegistroFusion): Promise<void>;
  /** Re-apunta a `nuevaConservadaId` los alias de `anteriorConservadaId`, con su versión. Devuelve cuántos. */
  reapuntarAlias(anteriorConservadaId: string, nuevaConservadaId: string): Promise<number>;
  /** Idempotente: un par ya descartado queda como estaba. */
  descartar(par: ParPersonas, usuarioId: string, ahora: Date): Promise<void>;
  /** `false` si el par no estaba descartado. */
  quitarDescarte(par: ParPersonas): Promise<boolean>;
  estaDescartado(par: ParPersonas): Promise<boolean>;
}
