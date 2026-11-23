import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { FechaCalendario } from '@vitrina/plataforma/org';
import { debeAvisar, diasRestantes, limiteDeRevision } from '../domain/aviso-certificado.js';
import type { CertificadoEmisor, Emisor } from '../domain/emisor.js';
import { certificadoPorVencer } from '../domain/eventos-fe.js';
import type { DiasAvisoCertificado } from './ports/dias-aviso-certificado.js';
import type { EmisorPendienteDeAviso, RepositorioAvisosCertificado } from './ports/repositorio-avisos-certificado.js';
import type { RepositorioEmisores } from './ports/repositorio-emisores.js';

export const TAMANO_LOTE_AVISOS = 200;
/** Menor que cualquier uuid: el cursor de la primera página. */
const ANTES_DEL_PRIMER_EMISOR = '00000000-0000-0000-0000-000000000000';

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasAvisos {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  publicador: EventPublisher;
  emisores: RepositorioEmisores;
  avisos: RepositorioAvisosCertificado;
  diasAviso: DiasAvisoCertificado;
  informar: Registrar;
  avisar: Registrar;
}

interface Corrida {
  tenantId: string;
  dias: number;
  hoy: FechaCalendario;
}

export interface ResultadoAvisos {
  revisados: number;
  avisados: number;
  fallidos: number;
}

/**
 * Tarea diaria (TR-RF-052): publica `fe.certificado.por_vencer` una vez por certificado (huella) cuando faltan
 * `plat.fe.dias_aviso_certificado` días o menos. Cada emisor va en su transacción con el contexto de su tenant;
 * si uno falla, se registra y la tarea sigue. Idempotente: otra corrida del mismo día no repite avisos.
 */
export class AvisarCertificadosPorVencer {
  constructor(private readonly dependencias: DependenciasAvisos) {}

  async ejecutar(hoy: FechaCalendario): Promise<ResultadoAvisos> {
    const resultado: ResultadoAvisos = { revisados: 0, avisados: 0, fallidos: 0 };
    const hasta = limiteDeRevision(hoy);
    let cursor = ANTES_DEL_PRIMER_EMISOR;
    for (;;) {
      const lote = await this.dependencias.avisos.pendientes(hasta, cursor, TAMANO_LOTE_AVISOS);
      for (const pendiente of lote) await this.revisar(pendiente, hoy, resultado);
      if (lote.length < TAMANO_LOTE_AVISOS) break;
      cursor = lote[lote.length - 1].emisorId;
    }
    this.dependencias.informar('Avisos de certificados por vencer', { fecha: hoy, ...resultado });
    return resultado;
  }

  private async revisar(pendiente: EmisorPendienteDeAviso, hoy: FechaCalendario, resultado: ResultadoAvisos): Promise<void> {
    resultado.revisados += 1;
    try {
      if (await this.avisarSiCorresponde(pendiente, hoy)) resultado.avisados += 1;
    } catch (error) {
      resultado.fallidos += 1;
      // Solo el nombre del error: el mensaje puede traer datos de la base (TR-RNF-026).
      this.dependencias.avisar('Aviso de certificado falló', {
        tenant_id: pendiente.tenantId,
        emisor_id: pendiente.emisorId,
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  private avisarSiCorresponde({ tenantId, emisorId }: EmisorPendienteDeAviso, hoy: FechaCalendario): Promise<boolean> {
    const { contexto, unidadDeTrabajo, emisores, diasAviso } = this.dependencias;
    return contexto.run({ tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const emisor = await emisores.porId(emisorId);
        const certificado = emisor?.certificado;
        if (!emisor || !certificado) return false;
        const dias = await diasAviso.delTenant();
        if (!debeAvisar(certificado.venceEn, hoy, dias)) return false;
        return this.registrarYPublicar(emisor, certificado, { tenantId, dias, hoy });
      }),
    );
  }

  /** El evento sale solo si el aviso entró: dos corridas a la vez dejan una fila y un evento. */
  private async registrarYPublicar(emisor: Emisor, certificado: CertificadoEmisor, corrida: Corrida): Promise<boolean> {
    const { ids, reloj, avisos, publicador } = this.dependencias;
    const { tenantId, dias, hoy } = corrida;
    const registrado = await avisos.registrar({
      id: ids.next(),
      tenantId,
      emisorId: emisor.id,
      huellaSha256: certificado.huellaSha256,
      diasAntes: dias,
      venceEn: certificado.venceEn,
      fechaEjecucion: hoy,
    });
    if (!registrado) return false;
    const carga = {
      emisor_id: emisor.id,
      empresa_id: emisor.empresaId,
      ruc: certificado.ruc,
      vence_en: certificado.venceEn.toISOString(),
      dias_restantes: diasRestantes(certificado.venceEn, hoy),
    };
    await publicador.publish(certificadoPorVencer(emisor.version, carga, reloj.now()));
    return true;
  }
}
