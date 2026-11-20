import { ArchivoNoEncontradoError } from '@vitrina/plataforma/archivos';
import type { Consentimiento } from '../../domain/consentimiento.js';
import { ConsentimientosDePersona, type DecisionDelLote } from '../../domain/consentimientos-de-persona.js';
import { EvidenciaInvalidaError, EvidenciaNoEncontradaError } from '../../domain/errores.js';
import { eventoConsentimientoRevocado } from '../../domain/eventos-per.js';
import type { DependenciasPersonas } from '../dependencias-personas.js';
import type { DecisionRegistrada, RegistrarConsentimientosComando } from '../ports/consentimiento.port.js';
import { exigirPersona, exigirUsuario } from './exigencias.js';
import { decisionRegistradaDe } from './vista-consentimiento.js';

export const ACCION_REGISTRAR_CONSENTIMIENTOS = 'plat.persona.consentimiento.registrar';
const ENTIDAD_AUDITADA = 'persona';
const ESTADO_EVIDENCIA_VALIDA = 'DISPONIBLE';
const CATEGORIA_EVIDENCIA = 'EVIDENCIA';

/** Como el comando del puerto, pero `decision` y `accionExpresa` pueden faltar: el dominio los rechaza. */
export interface RegistroDeDecisiones extends Omit<RegistrarConsentimientosComando, 'decisiones'> {
  decisiones: DecisionDelLote[];
}

/**
 * TR-RF-043: registra en lote las decisiones de una persona, todo o nada. Un RECHAZA sobre un ACEPTA vigente
 * lo revoca y publica `consentimiento.revocado`. Registrar se audita aquí, en la transacción.
 */
export class RegistrarConsentimientos {
  constructor(private readonly dependencias: DependenciasPersonas) {}

  async ejecutar(comando: RegistroDeDecisiones): Promise<DecisionRegistrada[]> {
    // Fuera de la transacción: ArchivoPort abre la suya y un archivo DISPONIBLE no vuelve atrás.
    if (comando.evidenciaArchivoId) await this.exigirEvidenciaValida(comando.evidenciaArchivoId);
    const { unidadDeTrabajo, reloj, ids, contexto, personas, consentimientos, publicador } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const persona = await exigirPersona(personas, comando.personaId);
      const registradoPor = exigirUsuario(contexto);
      const historial = new ConsentimientosDePersona(persona.id, await consentimientos.decisionesDe(persona.id));
      const { nuevas, revocadas, reemplazadas } = historial.registrar(comando.decisiones, await consentimientos.textosVigentes(), {
        canal: comando.canal,
        evidenciaArchivoId: comando.evidenciaArchivoId ?? null,
        registradoPor,
        registradoEn: reloj.now(),
        nuevoId: () => ids.next(),
      });

      await consentimientos.guardar(nuevas, [...revocadas, ...reemplazadas]);
      await this.auditar(persona.id, comando, nuevas);
      for (const revocada of revocadas) await publicador.publish(eventoConsentimientoRevocado(revocada, persona.version));
      return nuevas.map(decisionRegistradaDe);
    });
  }

  private async exigirEvidenciaValida(archivoId: string): Promise<void> {
    const archivo = await this.dependencias.archivos.estado(archivoId).catch((error: unknown) => {
      throw error instanceof ArchivoNoEncontradoError ? new EvidenciaNoEncontradaError() : error;
    });
    if (archivo.estado !== ESTADO_EVIDENCIA_VALIDA) throw new EvidenciaInvalidaError('NO_DISPONIBLE');
    if (archivo.categoria !== CATEGORIA_EVIDENCIA) throw new EvidenciaInvalidaError('CATEGORIA');
  }

  /** Sin el texto legal: la versión basta para saber qué se aceptó. */
  private auditar(personaId: string, comando: RegistroDeDecisiones, nuevas: Consentimiento[]): Promise<void> {
    return this.dependencias.auditoria.registrar({
      accion: ACCION_REGISTRAR_CONSENTIMIENTOS,
      entidadTipo: ENTIDAD_AUDITADA,
      entidadId: personaId,
      despues: {
        canal: comando.canal,
        evidencia_archivo_id: comando.evidenciaArchivoId ?? null,
        decisiones: nuevas.map(({ finalidad, decision, versionTexto }) => ({ finalidad, decision, version_texto: versionTexto })),
      },
    });
  }
}
