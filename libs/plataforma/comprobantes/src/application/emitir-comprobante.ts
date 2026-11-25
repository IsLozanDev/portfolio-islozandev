import type { CorrelativoPort, SeriesActivasPort } from '@vitrina/plataforma/correlativos';
import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { fechaCalendarioDe } from '@vitrina/plataforma/org';
import { TIPO_DOCUMENTO_RUC, type Adquirente } from '../domain/comprobante/adquirente.js';
import { Comprobante, prepararEmision } from '../domain/comprobante/comprobante.js';
import type { EntradaLinea } from '../domain/comprobante/linea-comprobante.js';
import { advertenciasDelPadron, type Advertencia } from '../domain/comprobante/reglas-factura.js';
import type { TipoComprobante } from '../domain/comprobante/tipo-comprobante.js';
import type { Emisor } from '../domain/emisor.js';
import {
  CodigoSunatInvalidoError,
  EmisorNoEncontradoError,
  IdempotenciaConflictoError,
  SerieAmbiguaError,
  SerieNoCorrespondeError,
} from '../domain/errores.js';
import type { ComprobanteEmitido, ComprobantePort, EmitirComprobanteComando } from './ports/comprobante.port.js';
import type { CatalogosSunat, PadronAdquirente, SucursalesEmisoras, TasaIgv, UmbralBoleta } from './ports/reglas-emision.js';
import type { RepositorioComprobantes } from './ports/repositorio-comprobantes.js';
import type { RepositorioEmisores } from './ports/repositorio-emisores.js';
import { normalizarSolicitud, type LineaSolicitada, type SolicitudEmision } from './solicitud-emision.js';
import { comprobanteEmitidoDe } from './vista-comprobante.js';

export interface DependenciasEmision {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  publicador: EventPublisher;
  emisores: RepositorioEmisores;
  sucursales: SucursalesEmisoras;
  series: SeriesActivasPort;
  correlativo: CorrelativoPort;
  catalogos: CatalogosSunat;
  tasas: TasaIgv;
  umbral: UmbralBoleta;
  padron: PadronAdquirente;
  comprobantes: RepositorioComprobantes;
}

/** Campos del comando que se validan contra CAT, como los nombra el error. */
const CAMPOS = { moneda: 'moneda', tipoDocumento: 'adquirente.tipoDocumento' } as const;

/**
 * TR-RF-053 y 054. Todo lo que puede rechazar la emisión ocurre antes de pedir el número, que va al final de la
 * transacción (bloquea la serie hasta el commit). Una carrera con la misma clave la resuelve
 * uq_comprobante_idempotencia: el perdedor revierte sin consumir número (EmisionConcurrenteError).
 */
export class EmitirComprobante implements ComprobantePort {
  constructor(private readonly dependencias: DependenciasEmision) {}

  async emitir(comando: EmitirComprobanteComando): Promise<ComprobanteEmitido> {
    const solicitud = normalizarSolicitud(comando);
    return this.dependencias.unidadDeTrabajo.run(async () => {
      const existente = await this.dependencias.comprobantes.porClave(comando.claveIdempotencia);
      if (existente) return this.repeticion(existente, solicitud);
      return this.emitirNuevo(solicitud);
    });
  }

  private repeticion(existente: Comprobante, solicitud: SolicitudEmision): ComprobanteEmitido {
    if (!existente.tieneLaHuella(solicitud.huella)) throw new IdempotenciaConflictoError();
    return comprobanteEmitidoDe(existente, true);
  }

  private async emitirNuevo(solicitud: SolicitudEmision): Promise<ComprobanteEmitido> {
    const { reloj, ids, contexto, sucursales, tasas, umbral, correlativo, comprobantes, publicador } = this.dependencias;
    const { comando } = solicitud;
    const emisor = await this.emisorHabilitado(comando.empresaId);
    await sucursales.exigirDeLaEmpresa(comando.sucursalId, comando.empresaId);
    const serie = await this.serieDeLaSucursal(comando.tipo, comando.sucursalId, comando.serie);
    await this.validarCodigosDeCabecera(comando.moneda, solicitud.adquirente);
    const lineas = await this.lineasConGrupo(solicitud.lineas);
    const advertencias = await this.advertenciasDelAdquirente(comando.tipo, solicitud.adquirente);
    const { tenantId, actorId } = contexto.current();
    const ahora = reloj.now();

    const preparada = prepararEmision({
      id: ids.next(),
      tenantId,
      empresaId: comando.empresaId,
      sucursalId: comando.sucursalId,
      emisorId: emisor.id,
      tipo: comando.tipo,
      serie,
      fechaEmision: fechaCalendarioDe(ahora),
      moneda: comando.moneda,
      formaPago: comando.formaPago,
      cuotas: solicitud.cuotas,
      adquirente: solicitud.adquirente,
      lineas,
      totalEsperado: solicitud.totalEsperado,
      modoEnvio: solicitud.modoEnvio,
      origen: comando.origen ?? null,
      claveIdempotencia: comando.claveIdempotencia,
      huellaSolicitud: solicitud.huella,
      advertencias,
      regimenIgv: emisor.regimenIgv,
      tasaIgv: await tasas.vigente(emisor.regimenIgv),
      umbralBoleta: await umbral.valor(comando.empresaId, comando.sucursalId),
      creadoPor: actorId ?? null,
      creadoEn: ahora,
    });

    const { numero } = await correlativo.siguiente({ empresaId: comando.empresaId, tipo: comando.tipo, serie });
    const comprobante = Comprobante.emitir(preparada, Number(numero));
    await comprobantes.guardar(comprobante);
    for (const evento of comprobante.extraerEventos()) await publicador.publish(evento);
    return comprobanteEmitidoDe(comprobante, false);
  }

  private async emisorHabilitado(empresaId: string): Promise<Emisor> {
    const emisor = await this.dependencias.emisores.porEmpresa(empresaId);
    if (!emisor) throw new EmisorNoEncontradoError();
    emisor.exigirHabilitadoParaEmitir();
    return emisor;
  }

  /** La enviada debe estar entre las activas de la sucursal; sin serie, la única activa del tipo. */
  private async serieDeLaSucursal(tipo: TipoComprobante, sucursalId: string, serieEnviada: string | undefined): Promise<string> {
    const activas = await this.dependencias.series.deSucursal(sucursalId, tipo);
    if (serieEnviada !== undefined) {
      if (!activas.includes(serieEnviada)) {
        throw new SerieNoCorrespondeError(`La serie ${serieEnviada} no está activa para ${tipo} en la sucursal`);
      }
      return serieEnviada;
    }
    const [unica, ...otras] = activas;
    if (unica === undefined) throw new SerieNoCorrespondeError(`La sucursal no tiene una serie activa para ${tipo}`);
    if (otras.length > 0) throw new SerieAmbiguaError();
    return unica;
  }

  private async validarCodigosDeCabecera(moneda: string, adquirente: Adquirente | null): Promise<void> {
    const { catalogos } = this.dependencias;
    if (!(await catalogos.existeMoneda(moneda))) throw new CodigoSunatInvalidoError(CAMPOS.moneda, moneda);
    if (adquirente && !(await catalogos.existeTipoDocumento(adquirente.tipoDocumento))) {
      throw new CodigoSunatInvalidoError(CAMPOS.tipoDocumento, adquirente.tipoDocumento);
    }
  }

  private async lineasConGrupo(lineas: readonly LineaSolicitada[]): Promise<EntradaLinea[]> {
    const { catalogos } = this.dependencias;
    const conGrupo: EntradaLinea[] = [];
    for (const [indice, linea] of lineas.entries()) {
      if (!(await catalogos.existeUnidad(linea.unidad))) throw new CodigoSunatInvalidoError(`lineas.${indice}.unidad`, linea.unidad);
      const grupo = await catalogos.grupoAfectacion(linea.afectacionIgv);
      if (grupo === null) throw new CodigoSunatInvalidoError(`lineas.${indice}.afectacionIgv`, linea.afectacionIgv);
      conGrupo.push({ ...linea, grupo });
    }
    return conGrupo;
  }

  /** TR-RN-019: solo la factura a un RUC consulta el padrón; advierte, no bloquea. */
  private async advertenciasDelAdquirente(tipo: TipoComprobante, adquirente: Adquirente | null): Promise<Advertencia[]> {
    if (tipo !== 'FACTURA' || adquirente?.tipoDocumento !== TIPO_DOCUMENTO_RUC) return [];
    return advertenciasDelPadron(await this.dependencias.padron.situacion(adquirente.numero));
  }
}
