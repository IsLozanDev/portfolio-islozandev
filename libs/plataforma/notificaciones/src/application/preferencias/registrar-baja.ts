import { Baja, type AlcanceBaja } from '../../domain/baja.js';
import type { CargaEnlace } from '../../domain/enlace-preferencias.js';
import { CONSENTIMIENTO_PROMOCIONAL } from '../../domain/finalidad-notificacion.js';
import type { DependenciasPreferencias } from '../dependencias.js';
import { verificarEnlace } from './enlace-verificado.js';

/** La baja la hace el titular desde la página pública: el canal de la revocación en PER. */
const CANAL_REVOCACION = 'WEB';
const EVENTO_BAJA_REGISTRADA = 'not.baja.registrada';

export interface BajasDestino {
  bajas: AlcanceBaja[];
}

/**
 * TR-RF-077: el destinatario deja las promociones o el canal entero. Con persona, la baja revoca además
 * `PROMOCIONES` en PER, en la misma transacción, para que PER siga siendo la única fuente legal del
 * consentimiento. La revoca el titular: `actorId = personaId`. Repetir la baja no duplica.
 */
export class RegistrarBaja {
  constructor(private readonly dependencias: DependenciasPreferencias) {}

  async ejecutar(token: string, alcance: AlcanceBaja): Promise<BajasDestino> {
    const carga = verificarEnlace(this.dependencias, token);
    const { contexto, unidadDeTrabajo } = this.dependencias;
    const alcanceContexto = { tenantId: carga.tenantId, ...(carga.personaId ? { actorId: carga.personaId } : {}) };
    return contexto.run(alcanceContexto, () => unidadDeTrabajo.run(() => this.registrar(carga, alcance)));
  }

  private async registrar(carga: CargaEnlace, alcance: AlcanceBaja): Promise<BajasDestino> {
    const { bajas, ids, informar } = this.dependencias;
    const nueva = Baja.registrar({
      id: ids.next(),
      tenantId: carga.tenantId,
      canal: carga.canal,
      alcance,
      destinoHash: carga.destinoHash,
      personaId: carga.personaId ?? null,
    });
    const guardada = await bajas.registrar(nueva);
    if (carga.personaId) await this.revocarPromociones(carga.personaId);
    informar(EVENTO_BAJA_REGISTRADA, { destino_hash: carga.destinoHash, alcance, repetida: guardada.id !== nueva.id });
    const vigentes = await bajas.delDestino(carga.canal, carga.destinoHash);
    return { bajas: vigentes.map((baja) => baja.alcance) };
  }

  private async revocarPromociones(personaId: string): Promise<void> {
    const { consentimientos } = this.dependencias;
    if (!(await consentimientos.vigente(personaId, CONSENTIMIENTO_PROMOCIONAL))) return;
    await consentimientos.revocar(personaId, CONSENTIMIENTO_PROMOCIONAL, CANAL_REVOCACION);
  }
}
