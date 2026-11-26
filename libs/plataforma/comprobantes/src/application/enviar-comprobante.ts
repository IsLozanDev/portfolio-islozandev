import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import type { Comprobante } from '../domain/comprobante/comprobante.js';
import { documentoDesdeComprobante } from '../domain/comprobante/documento-desde-comprobante.js';
import { respuestaFinalDe, type ArchivosRespuesta, type RespuestaFinal } from '../domain/comprobante/respuesta-comprobante.js';
import { ESTADO_INICIAL_COMPROBANTE, formatearNumero } from '../domain/comprobante/tipo-comprobante.js';
import type { DocumentoElectronico } from '../domain/documento-electronico.js';
import type { Emisor } from '../domain/emisor.js';
import { nuevoIntento, type ResultadoEnvio } from '../domain/envio/intento-envio.js';
import { MOTIVOS_NO_ENVIO, type MotivoNoEnvio } from '../domain/envio/motivos-no-envio.js';
import {
  DatosEmisorIncompletosError,
  EmisorNoHabilitadoError,
  ProveedorFeInvalidoError,
  UrlProveedorNoPermitidaError,
} from '../domain/errores.js';
import { PROVEEDORES_CON_ADAPTADOR } from '../domain/proveedores-fe.js';
import type { RespuestaPse, ResultadoPse } from '../domain/respuesta-pse.js';
import { credencialesDelEmisor } from './credenciales-emisor.js';
import { urlDelProveedor } from './dependencias-fe.js';
import { ErrorTecnicoPseError } from './ejecutar-prueba-emisor.js';
import type { ArchivosCpe } from './ports/archivos-cpe.js';
import type { IntentoTrabajoEnvio, TrabajoEnvioFe } from './ports/cola-envios-fe.js';
import type { EmpresaEmisoraPort } from './ports/empresa-emisora.port.js';
import type { ProveedoresFe } from './ports/proveedores-fe.js';
import type { CredencialesPse, PseOsePort, ResolutorPse } from './ports/pse-ose.port.js';
import type { CatalogosSunat, SucursalesEmisoras } from './ports/reglas-emision.js';
import type { RepositorioComprobantes } from './ports/repositorio-comprobantes.js';
import type { RepositorioEmisores } from './ports/repositorio-emisores.js';
import type { RepositorioEnvios } from './ports/repositorio-envios.js';

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

/** Los que envían comprobantes reales en el spec 52. Nubefact queda como alterno, sin mapeo completo. */
export const PROVEEDORES_CON_ENVIO: readonly string[] = [PROVEEDORES_CON_ADAPTADOR.sunat, PROVEEDORES_CON_ADAPTADOR.simulado];

export const EVENTOS_LOG_ENVIO = {
  resultado: 'fe.envio.resultado',
  credencialInvalida: 'fe.envio.credencial_invalida',
  noEnviado: 'fe.envio.no_enviado',
} as const;

export interface DependenciasEnvio {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  ids: IdGenerator;
  publicador: EventPublisher;
  comprobantes: RepositorioComprobantes;
  envios: RepositorioEnvios;
  emisores: RepositorioEmisores;
  empresas: EmpresaEmisoraPort;
  sucursales: Pick<SucursalesEmisoras, 'codigoEstablecimiento'>;
  catalogos: Pick<CatalogosSunat, 'codigoSunatTipoDocumento'>;
  proveedores: ProveedoresFe;
  boveda: Pick<BovedaSecretos, 'leer'>;
  resolutor: ResolutorPse;
  archivos: ArchivosCpe;
  informar: Registrar;
  avisar: Registrar;
}

interface EnvioPreparado {
  comprobante: Comprobante;
  proveedor: string;
  adaptador: PseOsePort;
  credenciales: CredencialesPse;
  documento: DocumentoElectronico;
}

interface EnvioImpedido {
  comprobante: Comprobante;
  proveedor: string;
  motivo: MotivoNoEnvio;
}

type Preparacion = { envio: EnvioPreparado } | { impedido: EnvioImpedido } | null;

/** Lo que se anota en fe.envio de cada intento. */
interface Resultado {
  resultado: ResultadoEnvio;
  codigo: string | null;
  descripcion: string | null;
  duracionMs: number | null;
}

/** Interno: la configuración impide enviar; se anota NO_ENVIADO con el motivo y no se reintenta. */
class EnvioImposibleError extends Error {
  constructor(readonly motivo: MotivoNoEnvio) {
    super(`No se puede enviar: ${motivo}`);
  }
}

/** EN_PROCESO no cierra el envío ni es un resultado de fe.envio: se anota como técnico y se reintenta. */
function resultadoDeEnvio(resultado: ResultadoPse): ResultadoEnvio {
  return resultado === 'EN_PROCESO' ? 'ERROR_TECNICO' : resultado;
}

function seReintenta(resultado: ResultadoEnvio): boolean {
  return resultado === 'ERROR_TECNICO';
}

/**
 * TR-RF-059, procesador de `fe-envios` con el contexto del tenant del trabajo. Envía el comprobante PENDIENTE_ENVIO
 * con el adaptador del emisor, fuera de toda transacción. Con una respuesta final guarda primero el XML y el CDR en
 * ARC y después, en una transacción, el estado, el intento y `cpe.aceptado` o `cpe.rechazado`: si ARC falla, el
 * estado se registra igual (estado primero, archivo después) y nunca se reenvía un comprobante respondido.
 * ERROR_TECNICO se reintenta con BullMQ; CREDENCIAL_INVALIDA y NO_ENVIADO dejan el comprobante PENDIENTE_ENVIO.
 */
export class EnviarComprobante {
  constructor(private readonly dependencias: DependenciasEnvio) {}

  ejecutar(trabajo: TrabajoEnvioFe, intento: IntentoTrabajoEnvio): Promise<void> {
    return this.dependencias.contexto.run({ tenantId: trabajo.tenantId }, () => this.procesar(trabajo.comprobanteId, intento));
  }

  private async procesar(comprobanteId: string, intento: IntentoTrabajoEnvio): Promise<void> {
    const preparacion = await this.dependencias.unidadDeTrabajo.run(() => this.preparar(comprobanteId));
    if (preparacion === null) return;
    if ('impedido' in preparacion) return this.registrarImpedido(preparacion.impedido);
    const { envio } = preparacion;
    const { respuesta, duracionMs } = await this.enviar(envio);
    const final = respuestaFinalDe(respuesta);
    if (final) return this.registrarFinal(envio, respuesta, final, duracionMs);
    const resultado = resultadoDeEnvio(respuesta.resultado);
    await this.registrarIntento(envio.comprobante.id, envio.proveedor, { ...respuesta, resultado, duracionMs });
    if (resultado === 'CREDENCIAL_INVALIDA') this.avisarCredencialInvalida(envio, respuesta);
    if (seReintenta(resultado) && !intento.esUltimo) throw new ErrorTecnicoPseError();
  }

  /** null si el comprobante ya no espera envío (otro trabajo lo respondió) o va en el resumen diario (spec 55). */
  private async preparar(comprobanteId: string): Promise<Preparacion> {
    const comprobante = await this.dependencias.comprobantes.porId(comprobanteId);
    if (!comprobante || comprobante.datos.estado !== ESTADO_INICIAL_COMPROBANTE || comprobante.datos.modoEnvio === 'RESUMEN') return null;
    const emisor = await this.dependencias.emisores.porId(comprobante.datos.emisorId);
    if (!emisor) throw new Error('El comprobante no tiene emisor: la FK fe.comprobante.emisor_id lo impide');
    try {
      return { envio: await this.armarEnvio(comprobante, emisor) };
    } catch (error) {
      if (error instanceof EnvioImposibleError) return { impedido: { comprobante, proveedor: emisor.proveedor, motivo: error.motivo } };
      throw error;
    }
  }

  private async armarEnvio(comprobante: Comprobante, emisor: Emisor): Promise<EnvioPreparado> {
    exigirEmisorHabilitado(emisor);
    const secretoCredencialId = emisor.secretoCredencialId;
    if (secretoCredencialId === null) throw new EnvioImposibleError(MOTIVOS_NO_ENVIO.datosIncompletos);
    const { adaptador, proveedor } = await this.proveedorConEnvio(emisor.proveedor);
    const url = conMotivo(() => urlDelProveedor(emisor.urlProveedor, proveedor), UrlProveedorNoPermitidaError, MOTIVOS_NO_ENVIO.urlNoPermitida);
    const documento = await this.documentoDe(comprobante);
    const credenciales = await credencialesDelEmisor(emisor, secretoCredencialId, url, proveedor, this.dependencias.boveda);
    return { comprobante, proveedor: proveedor.codigo, adaptador, credenciales, documento };
  }

  /** SIN_ADAPTADOR: un proveedor sin envío real (Nubefact), fuera del catálogo o el simulador donde no se permite. */
  private async proveedorConEnvio(codigo: string) {
    if (!PROVEEDORES_CON_ENVIO.includes(codigo)) throw new EnvioImposibleError(MOTIVOS_NO_ENVIO.sinAdaptador);
    try {
      return { adaptador: this.dependencias.resolutor.para(codigo), proveedor: await this.dependencias.proveedores.obtener(codigo) };
    } catch (error) {
      if (error instanceof ProveedorFeInvalidoError) throw new EnvioImposibleError(MOTIVOS_NO_ENVIO.sinAdaptador);
      throw error;
    }
  }

  /** El anexo es el de la sucursal del comprobante: el establecimiento que vende. */
  private async documentoDe(comprobante: Comprobante): Promise<DocumentoElectronico> {
    const { empresaId, sucursalId, adquirente } = comprobante.datos;
    const { empresas, sucursales, catalogos } = this.dependencias;
    const empresa = await empresas.obtener(empresaId);
    const establecimiento = await sucursales.codigoEstablecimiento(sucursalId);
    const tipoDocumento = await catalogos.codigoSunatTipoDocumento(adquirente.tipoDocumento);
    if (tipoDocumento === null) throw new EnvioImposibleError(MOTIVOS_NO_ENVIO.datosIncompletos);
    return conMotivo(
      () => documentoDesdeComprobante(comprobante, empresa, establecimiento, tipoDocumento),
      DatosEmisorIncompletosError,
      MOTIVOS_NO_ENVIO.datosIncompletos,
    );
  }

  private async enviar(envio: EnvioPreparado): Promise<{ respuesta: RespuestaPse; duracionMs: number }> {
    const { reloj, informar } = this.dependencias;
    const inicio = reloj.now().getTime();
    const respuesta = await envio.adaptador.enviarComprobante(envio.credenciales, envio.documento);
    const duracionMs = reloj.now().getTime() - inicio;
    informar(EVENTOS_LOG_ENVIO.resultado, { ...referenciaEnLog(envio.comprobante), proveedor: envio.proveedor, resultado: respuesta.resultado, codigo: respuesta.codigo, duracion_ms: duracionMs });
    return { respuesta, duracionMs };
  }

  private async registrarImpedido({ comprobante, proveedor, motivo }: EnvioImpedido): Promise<void> {
    this.dependencias.avisar(EVENTOS_LOG_ENVIO.noEnviado, { ...referenciaEnLog(comprobante), proveedor, motivo });
    await this.registrarIntento(comprobante.id, proveedor, { resultado: 'NO_ENVIADO', codigo: motivo, descripcion: null, duracionMs: null });
  }

  private avisarCredencialInvalida(envio: EnvioPreparado, respuesta: RespuestaPse): void {
    this.dependencias.avisar(EVENTOS_LOG_ENVIO.credencialInvalida, { ...referenciaEnLog(envio.comprobante), proveedor: envio.proveedor, codigo: respuesta.codigo });
  }

  private registrarIntento(comprobanteId: string, proveedor: string, resultado: Resultado): Promise<void> {
    return this.dependencias.unidadDeTrabajo.run(() => this.insertarIntento(comprobanteId, proveedor, resultado));
  }

  private async insertarIntento(comprobanteId: string, proveedor: string, { resultado, codigo, descripcion, duracionMs }: Resultado): Promise<void> {
    const { envios, ids, contexto, reloj } = this.dependencias;
    const intento = await envios.siguienteIntento(comprobanteId);
    await envios.registrar(
      nuevoIntento({
        id: ids.next(),
        tenantId: contexto.current().tenantId,
        comprobanteId,
        intento,
        proveedor,
        resultado,
        codigo,
        descripcion,
        enviadoEn: reloj.now(),
        duracionMs,
      }),
    );
  }

  /** Relee el comprobante: si otro trabajo ya lo respondió, no hace nada. El intento y el evento van en la misma transacción. */
  private async registrarFinal(envio: EnvioPreparado, respuesta: RespuestaPse, final: RespuestaFinal, duracionMs: number): Promise<void> {
    const archivos = await this.guardarArchivos(envio, respuesta);
    const { unidadDeTrabajo, comprobantes, publicador, reloj } = this.dependencias;
    await unidadDeTrabajo.run(async () => {
      const actual = await comprobantes.porId(envio.comprobante.id);
      if (actual?.datos.estado !== ESTADO_INICIAL_COMPROBANTE) return;
      const versionLeida = actual.datos.version;
      actual.registrarRespuesta(final, archivos, reloj.now());
      await comprobantes.actualizarRespuesta(actual, versionLeida);
      await this.insertarIntento(actual.id, envio.proveedor, { ...respuesta, resultado: final.resultado, duracionMs });
      for (const evento of actual.extraerEventos()) await publicador.publish(evento);
    });
  }

  private async guardarArchivos({ comprobante, documento }: EnvioPreparado, { xmlFirmado, cdr }: RespuestaPse): Promise<ArchivosRespuesta> {
    const { archivos } = this.dependencias;
    return {
      xmlArchivoId: xmlFirmado ? await archivos.guardarXml(comprobante.id, documento, xmlFirmado) : null,
      cdrArchivoId: cdr ? await archivos.guardarCdr(comprobante.id, documento, cdr) : null,
    };
  }
}

function exigirEmisorHabilitado(emisor: Emisor): void {
  conMotivo(() => emisor.exigirHabilitadoParaEmitir(), EmisorNoHabilitadoError, MOTIVOS_NO_ENVIO.emisorNoHabilitado);
}

/** Traduce un error de dominio conocido al motivo de NO_ENVIADO. */
function conMotivo<Valor>(calcular: () => Valor, tipoError: new (...argumentos: never[]) => Error, motivo: MotivoNoEnvio): Valor {
  try {
    return calcular();
  } catch (error) {
    if (error instanceof tipoError) throw new EnvioImposibleError(motivo);
    throw error;
  }
}

/** TR-RNF-026: sin datos del adquirente, del documento ni de las credenciales. */
function referenciaEnLog(comprobante: Comprobante): Record<string, unknown> {
  const { id, emisorId, serie, numero } = comprobante.datos;
  return { comprobante_id: id, emisor_id: emisorId, comprobante: formatearNumero(serie, numero) };
}
