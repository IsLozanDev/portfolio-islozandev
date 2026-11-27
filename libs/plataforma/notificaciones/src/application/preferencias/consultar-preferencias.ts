import type { AlcanceBaja } from '../../domain/baja.js';
import type { CanalNotificacion } from '../../domain/canal.js';
import { enmascararCorreo, type CargaEnlace } from '../../domain/enlace-preferencias.js';
import type { DependenciasPreferencias } from '../dependencias.js';
import { verificarEnlace } from './enlace-verificado.js';

const SIN_DESTINO = '';

export interface PreferenciasDestino {
  /** `j***@gmail.com`: nunca el correo completo. */
  destinoEnmascarado: string;
  canal: CanalNotificacion;
  bajas: AlcanceBaja[];
}

/** Lo que ve el destinatario al abrir el enlace del pie (TR-RF-077). Con el tenant del token, sin usuario. */
export class ConsultarPreferencias {
  constructor(private readonly dependencias: DependenciasPreferencias) {}

  async ejecutar(token: string): Promise<PreferenciasDestino> {
    const carga = verificarEnlace(this.dependencias, token);
    const { contexto, unidadDeTrabajo } = this.dependencias;
    return contexto.run({ tenantId: carga.tenantId }, () => unidadDeTrabajo.run(() => this.leer(carga)));
  }

  private async leer(carga: CargaEnlace): Promise<PreferenciasDestino> {
    const { mensajes, bajas } = this.dependencias;
    const destino = await mensajes.ultimoDestino(carga.destinoHash);
    const vigentes = await bajas.delDestino(carga.canal, carga.destinoHash);
    return {
      destinoEnmascarado: enmascararCorreo(destino ?? SIN_DESTINO),
      canal: carga.canal,
      bajas: vigentes.map((baja) => baja.alcance),
    };
  }
}
