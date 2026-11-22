import type { Canal, Finalidad } from '../../domain/consentimiento.js';
import type {
  ConsentimientoPort,
  ConsentimientoVigente,
  DecisionRegistrada,
  RegistrarConsentimientosComando,
  TextoVigente,
} from '../ports/consentimiento.port.js';
import type { ConsultarConsentimientos } from './consultar-consentimientos.js';
import type { ConsultarTextos } from './consultar-textos.js';
import type { RegistrarConsentimientos } from './registrar-consentimientos.js';
import type { RevocarConsentimiento } from './revocar-consentimiento.js';

export interface CasosDeUsoConsentimientos {
  consultarConsentimientos: ConsultarConsentimientos;
  consultarTextos: ConsultarTextos;
  registrar: RegistrarConsentimientos;
  revocar: RevocarConsentimiento;
}

/** `ConsentimientoPort` para consumidores en proceso (TR-NOT, productos) sobre los casos de uso. */
export class ServicioConsentimientos implements ConsentimientoPort {
  constructor(private readonly casosDeUso: CasosDeUsoConsentimientos) {}

  vigente(personaId: string, finalidad: Finalidad): Promise<ConsentimientoVigente | null> {
    return this.casosDeUso.consultarConsentimientos.vigente(personaId, finalidad);
  }

  async textosVigentes(): Promise<TextoVigente[]> {
    const textos = await this.casosDeUso.consultarTextos.vigentes();
    return textos.map(({ finalidad, version, texto, publicadoEn }) => ({ finalidad, version, texto, publicadoEn }));
  }

  registrar(comando: RegistrarConsentimientosComando): Promise<DecisionRegistrada[]> {
    return this.casosDeUso.registrar.ejecutar(comando);
  }

  revocar(personaId: string, finalidad: Finalidad, canal: Canal): Promise<DecisionRegistrada> {
    return this.casosDeUso.revocar.ejecutar({ personaId, finalidad, canal });
  }
}
