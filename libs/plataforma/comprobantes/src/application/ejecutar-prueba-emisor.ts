import type { Clock, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import { boletaDePrueba, type DocumentoElectronico, type EmisorDocumento } from '../domain/documento-electronico.js';
import { emisorDePrueba, exigirDatosEmisor } from '../domain/emisor-documento.js';
import type { Emisor } from '../domain/emisor.js';
import { DatosEmisorIncompletosError, UrlProveedorNoPermitidaError } from '../domain/errores.js';
import { emisorVerificado } from '../domain/eventos-fe.js';
import type { RespuestaPse } from '../domain/respuesta-pse.js';
import { esSunatDirecto, urlDelProveedor } from './dependencias-fe.js';
import type { IntentoPrueba, TrabajoPruebaFe } from './ports/cola-pruebas-fe.js';
import type { EmpresaEmisora, EmpresaEmisoraPort, EstablecimientoPrincipalPort } from './ports/empresa-emisora.port.js';
import type { ProveedorFe, ProveedoresFe } from './ports/proveedores-fe.js';
import type { CredencialesPse, ResolutorPse } from './ports/pse-ose.port.js';
import type { RepositorioEmisores } from './ports/repositorio-emisores.js';

type Registrar = (mensaje: string, datos: Record<string, unknown>) => void;

export interface DependenciasPrueba {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  publicador: EventPublisher;
  emisores: RepositorioEmisores;
  empresas: EmpresaEmisoraPort;
  establecimientos: EstablecimientoPrincipalPort;
  proveedores: ProveedoresFe;
  boveda: Pick<BovedaSecretos, 'leer'>;
  resolutor: ResolutorPse;
  informar: Registrar;
}

/** Un ERROR_TECNICO con reintentos pendientes: BullMQ vuelve a correr el trabajo con backoff. */
export class ErrorTecnicoPseError extends Error {
  override readonly name = 'ErrorTecnicoPseError';

  constructor() {
    super('El PSE no respondió; se reintenta');
  }
}

export const CODIGO_SIN_SERIE_PRUEBA = 'SIN_SERIE_PRUEBA';
const MENSAJE_SIN_SERIE_PRUEBA = 'El proveedor no declara serie_prueba en PROVEEDOR_FE';
/** Cabe en fe.emisor.prueba_codigo (20); el error de dominio es URL_PROVEEDOR_NO_PERMITIDA. */
export const CODIGO_URL_NO_PERMITIDA = 'URL_NO_PERMITIDA';
/** Cabe en fe.emisor.prueba_codigo (20); el error de dominio es DATOS_EMISOR_INCOMPLETOS. */
export const CODIGO_DATOS_EMISOR_INCOMPLETOS = 'DATOS_INCOMPLETOS';
export const DESCRIPCION_REGISTRADO_POR_PSE = 'Registrado por el PSE; SUNAT aún no responde';

interface EnvioPreparado {
  proveedor: string;
  credenciales: CredencialesPse;
  documento: DocumentoElectronico;
}

/** La configuración no permite enviar: se registra como rechazo sin llamar al PSE. */
type Preparacion = { envio: EnvioPreparado } | { rechazo: RespuestaPse } | null;

const decodificador = new TextDecoder();

function rechazoPorConfiguracion(codigo: string, descripcion: string): Preparacion {
  return { rechazo: { resultado: 'RECHAZADO', codigo, descripcion, observaciones: [] } };
}

/**
 * La prueba en beta comprueba ruta, credencial y formato: si el PSE registró la boleta sin error, se supera aunque
 * SUNAT no haya respondido (Nubefact envía a SUNAT al día siguiente, según su política).
 */
function resultadoDePrueba(respuesta: RespuestaPse): RespuestaPse {
  if (respuesta.resultado !== 'EN_PROCESO') return respuesta;
  return { ...respuesta, resultado: 'ACEPTADO', descripcion: respuesta.descripcion ?? DESCRIPCION_REGISTRADO_POR_PSE };
}

/**
 * Procesador de `fe-pruebas` (TR-RF-052, paso 4), con el contexto del tenant del trabajo. Envía la boleta de prueba
 * con la serie del catálogo y el número de la prueba, fuera de toda transacción. Si la prueba ya no es la última o ya
 * tiene resultado, termina sin enviar. El token y, si el proveedor lo requiere, el .pfx y su clave se leen de la bóveda
 * solo aquí y no salen del adaptador.
 */
export class EjecutarPruebaEmisor {
  constructor(private readonly dependencias: DependenciasPrueba) {}

  ejecutar(trabajo: TrabajoPruebaFe, intento: IntentoPrueba): Promise<void> {
    return this.dependencias.contexto.run({ tenantId: trabajo.tenantId }, () => this.probar(trabajo, intento));
  }

  private async probar(trabajo: TrabajoPruebaFe, intento: IntentoPrueba): Promise<void> {
    const preparacion = await this.dependencias.unidadDeTrabajo.run(() => this.preparar(trabajo));
    if (preparacion === null) return;
    const respuesta = 'rechazo' in preparacion ? preparacion.rechazo : resultadoDePrueba(await this.enviar(preparacion.envio));
    this.dependencias.informar('Prueba en beta del emisor', {
      emisor_id: trabajo.emisorId,
      numero_prueba: trabajo.numeroPrueba,
      intento: intento.numero,
      resultado: respuesta.resultado,
    });
    if (respuesta.resultado === 'ERROR_TECNICO' && !intento.esUltimo) throw new ErrorTecnicoPseError();
    await this.registrar(trabajo, respuesta);
  }

  private async preparar({ emisorId, numeroPrueba }: TrabajoPruebaFe): Promise<Preparacion> {
    const { emisores, proveedores, empresas, reloj } = this.dependencias;
    const emisor = await emisores.porId(emisorId);
    if (!emisor?.esperaResultadoDe(numeroPrueba) || emisor.secretoCredencialId === null) return null;
    const proveedor = await proveedores.obtener(emisor.proveedor);
    if (proveedor.seriePrueba === null) return rechazoPorConfiguracion(CODIGO_SIN_SERIE_PRUEBA, MENSAJE_SIN_SERIE_PRUEBA);
    let url: string | null;
    try {
      // El catálogo pudo cambiar desde que se configuró: se vuelve a validar antes de llamar (anti-SSRF).
      url = urlDelProveedor(emisor.urlProveedor, proveedor);
    } catch (error) {
      if (error instanceof UrlProveedorNoPermitidaError) return rechazoPorConfiguracion(CODIGO_URL_NO_PERMITIDA, error.message);
      throw error;
    }
    let emisorDocumento: EmisorDocumento;
    try {
      emisorDocumento = await this.emisorDelDocumento(proveedor, await empresas.obtener(emisor.empresaId));
    } catch (error) {
      if (error instanceof DatosEmisorIncompletosError) return rechazoPorConfiguracion(CODIGO_DATOS_EMISOR_INCOMPLETOS, error.message);
      throw error;
    }
    const documento = boletaDePrueba(emisorDocumento, proveedor.seriePrueba, numeroPrueba, reloj.now());
    const credenciales = await this.credencialesDe(emisor, emisor.secretoCredencialId, url, proveedor);
    return { envio: { proveedor: proveedor.codigo, credenciales, documento } };
  }

  /** SUNAT directo firma el UBL en casa: lleva los datos reales del emisor y el anexo de la sucursal principal. */
  private async emisorDelDocumento(proveedor: ProveedorFe, empresa: EmpresaEmisora): Promise<EmisorDocumento> {
    if (!esSunatDirecto(proveedor)) return emisorDePrueba(empresa);
    return exigirDatosEmisor(empresa, await this.dependencias.establecimientos.codigo(empresa.id));
  }

  private async credencialesDe(emisor: Emisor, secretoId: string, url: string | null, proveedor: ProveedorFe): Promise<CredencialesPse> {
    const token = decodificador.decode(await this.dependencias.boveda.leer(secretoId));
    const credenciales: CredencialesPse = { url, usuario: emisor.usuarioProveedor, token, ambiente: emisor.ambiente };
    if (!proveedor.requiereCertificado) return credenciales;
    const certificado = await this.certificadoDe(emisor);
    return certificado ? { ...credenciales, certificado } : credenciales;
  }

  /** Solo en el worker y solo si el proveedor lo requiere; no sale del adaptador ni se registra. */
  private async certificadoDe(emisor: Emisor): Promise<CredencialesPse['certificado']> {
    const secretos = emisor.secretosCertificado;
    if (secretos === null) return undefined;
    const { boveda } = this.dependencias;
    return { pfx: await boveda.leer(secretos.certificadoId), clave: decodificador.decode(await boveda.leer(secretos.claveId)) };
  }

  private enviar({ proveedor, credenciales, documento }: EnvioPreparado): Promise<RespuestaPse> {
    return this.dependencias.resolutor.para(proveedor).enviarComprobante(credenciales, documento);
  }

  /** Relee el emisor: si mientras tanto se pidió otra prueba o se cambió la configuración, el resultado se ignora. */
  private registrar({ emisorId, numeroPrueba }: TrabajoPruebaFe, respuesta: RespuestaPse): Promise<void> {
    const { unidadDeTrabajo, emisores, reloj, publicador } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      const emisor = await emisores.porId(emisorId);
      if (!emisor?.esperaResultadoDe(numeroPrueba)) return;
      const ahora = reloj.now();
      const versionLeida = emisor.version;
      const pasoAVerificado = emisor.registrarResultadoPrueba(numeroPrueba, respuesta, ahora);
      emisor.registrarModificacionDelSistema(ahora);
      await emisores.actualizar(emisor, versionLeida);
      if (pasoAVerificado) await publicador.publish(emisorVerificado(emisor.version, emisor.cargaCambioEstado(), ahora));
    });
  }
}
