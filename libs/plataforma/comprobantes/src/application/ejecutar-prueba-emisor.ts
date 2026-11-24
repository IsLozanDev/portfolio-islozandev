import type { Clock, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { fechaCalendarioDe } from '@vitrina/plataforma/org';
import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import { boletaDePrueba, type DocumentoElectronico } from '../domain/documento-electronico.js';
import type { Emisor } from '../domain/emisor.js';
import { UrlProveedorNoPermitidaError } from '../domain/errores.js';
import { emisorVerificado } from '../domain/eventos-fe.js';
import type { RespuestaPse } from '../domain/respuesta-pse.js';
import { urlDelProveedor } from './dependencias-fe.js';
import type { IntentoPrueba, TrabajoPruebaFe } from './ports/cola-pruebas-fe.js';
import type { EmpresaEmisoraPort } from './ports/empresa-emisora.port.js';
import type { ProveedoresFe } from './ports/proveedores-fe.js';
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
 * tiene resultado, termina sin enviar. El token se lee de la bóveda solo aquí y no sale del adaptador.
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
    const empresa = await empresas.obtener(emisor.empresaId);
    const documento = boletaDePrueba(empresa.ruc, proveedor.seriePrueba, numeroPrueba, fechaCalendarioDe(reloj.now()));
    return { envio: { proveedor: proveedor.codigo, credenciales: await this.credencialesDe(emisor, emisor.secretoCredencialId, url), documento } };
  }

  private async credencialesDe(emisor: Emisor, secretoId: string, url: string | null): Promise<CredencialesPse> {
    const token = decodificador.decode(await this.dependencias.boveda.leer(secretoId));
    return { url, usuario: emisor.usuarioProveedor, token, ambiente: emisor.ambiente };
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
