import type { CertificadoLeido } from './certificado-leido.js';
import {
  CertificadoVencidoError,
  DatosEmisorInvalidosError,
  EmisorEnProduccionError,
  EmisorNoHabilitadoError,
  EstadoEmisorInvalidoError,
  ProduccionNoPermitidaError,
  ProveedorSimuladoEnProduccionError,
  PruebaBetaRequeridaError,
  PruebaEnCursoError,
} from './errores.js';
import {
  AMBIENTE_INICIAL,
  PRUEBA_ATASCADA_MINUTOS,
  VIGENCIA_PRUEBA_HORAS,
  type AmbienteEmisor,
  type EstadoEmisor,
  type EstadoPrueba,
} from './estado-emisor.js';
import type { CambioEstadoEmisor, EmisorConfigurado } from './eventos-fe.js';
import { esRegimenIgv, REGIMEN_IGV_POR_DEFECTO, type RegimenIgv } from './regimen-igv.js';
import { recortar } from './recortar.js';
import { fueAceptado, type RespuestaPse, type ResultadoPse } from './respuesta-pse.js';

/** Los mismos largos que las columnas de fe.emisor. */
export const LARGO_MAXIMO_PROVEEDOR = 40;
export const LARGO_MAXIMO_USUARIO = 100;
export const LARGO_MAXIMO_LEYENDA = 300;
export const LARGO_MAXIMO_URL = 255;
export const VERSION_INICIAL_EMISOR = 1;
/** Los mismos largos que fe.emisor.prueba_codigo y prueba_descripcion. */
export const LARGO_MAXIMO_CODIGO_PRUEBA = 20;
export const LARGO_MAXIMO_DESCRIPCION_PRUEBA = 500;
const MILISEGUNDOS_POR_MINUTO = 60_000;
const MINUTOS_POR_HORA = 60;
const PRUEBAS_INICIALES = 0;
const ESTADOS_QUE_EMITEN: readonly EstadoEmisor[] = ['VERIFICADO', 'PRODUCCION'];

/** El certificado vigente del emisor: sus datos públicos. El .pfx y su clave están en la bóveda. */
export interface CertificadoEmisor {
  ruc: string;
  venceEn: Date;
  huellaSha256: string;
}

/** La última prueba en beta. `numero` es `pruebasEnviadas` al solicitarla. */
export interface PruebaEmisor {
  estado: EstadoPrueba;
  numero: number;
  solicitadaEn: Date;
  resultadoEn: Date | null;
  codigo: string | null;
  descripcion: string | null;
}

/** Lo que decide el paso a producción además del estado del emisor. */
export interface ReglasProduccion {
  produccionPermitida: boolean;
  esSimulado: boolean;
  requiereCertificado: boolean;
}

export interface SecretosCertificado {
  certificadoId: string;
  claveId: string;
}

export interface EmisorProps {
  id: string;
  tenantId: string;
  empresaId: string;
  proveedor: string;
  ambiente: AmbienteEmisor;
  estado: EstadoEmisor;
  regimenIgv: RegimenIgv;
  leyendaPie: string | null;
  usuarioProveedor: string | null;
  secretoCredencialId: string | null;
  secretoCertificadoId: string | null;
  secretoClaveCertificadoId: string | null;
  certificado: CertificadoEmisor | null;
  urlProveedor: string | null;
  /** Correlativo de prueba propio del emisor (sin SEQ): el número de la última prueba. */
  pruebasEnviadas: number;
  prueba: PruebaEmisor | null;
  produccionHabilitadaEn: Date | null;
  produccionHabilitadaPor: string | null;
  version: number;
  creadoPor: string;
  creadoEn: Date;
  modificadoPor: string | null;
  modificadoEn: Date | null;
}

export interface DatosNuevoEmisor {
  id: string;
  tenantId: string;
  empresaId: string;
  creadoPor: string;
  ahora: Date;
}

export interface ConfiguracionProveedor {
  proveedor: string;
  usuarioProveedor: string;
  regimenIgv: string;
  leyendaPie: string | null;
  /** Ya validada contra los dominios permitidos del proveedor (`exigirUrlPermitida`). */
  urlProveedor: string | null;
}

/** Los que recalcula la configuración; VERIFICADO y PRODUCCION los fijan la prueba y el paso a producción. */
const ESTADOS_DE_CONFIGURACION: readonly EstadoEmisor[] = ['BORRADOR', 'CONFIGURADO'];
const ESTADOS_QUE_PIDEN_PRUEBA: readonly EstadoEmisor[] = ['CONFIGURADO', 'VERIFICADO'];

function minutosEntre(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / MILISEGUNDOS_POR_MINUTO;
}

function estadoPruebaDe(resultado: Exclude<ResultadoPse, 'EN_PROCESO'>): EstadoPrueba {
  if (fueAceptado(resultado)) return 'ACEPTADA';
  if (resultado === 'RECHAZADO' || resultado === 'CREDENCIAL_INVALIDA') return 'RECHAZADA';
  return 'ERROR';
}

function exigirTexto(valor: string, largoMaximo: number, campo: string): string {
  const limpio = valor.trim();
  if (limpio.length === 0 || limpio.length > largoMaximo) {
    throw new DatosEmisorInvalidosError(`${campo} debe tener entre 1 y ${largoMaximo} caracteres`);
  }
  return limpio;
}

function exigirLeyenda(leyenda: string | null): string | null {
  if (leyenda === null) return null;
  const limpia = leyenda.trim();
  if (limpia.length === 0) return null;
  if (limpia.length > LARGO_MAXIMO_LEYENDA) {
    throw new DatosEmisorInvalidosError(`La leyenda del pie va hasta ${LARGO_MAXIMO_LEYENDA} caracteres`);
  }
  return limpia;
}

function exigirRegimen(regimen: string): RegimenIgv {
  if (!esRegimenIgv(regimen)) throw new DatosEmisorInvalidosError('El régimen de IGV no es válido');
  return regimen;
}

/**
 * Emisor electrónico de una empresa (TR-RF-052): proveedor PSE, su credencial y el certificado con los secretos en
 * la bóveda (pasos 1 a 3), prueba en beta y paso a producción (pasos 4 y 5). `version` es la de la fila y el bloqueo optimista.
 */
export class Emisor {
  private constructor(private readonly props: EmisorProps) {}

  /** Nace en BORRADOR, en BETA y sin proveedor hasta `configurarProveedor`. */
  static crear(datos: DatosNuevoEmisor): Emisor {
    return new Emisor({
      id: datos.id,
      tenantId: datos.tenantId,
      empresaId: datos.empresaId,
      proveedor: '',
      ambiente: AMBIENTE_INICIAL,
      estado: 'BORRADOR',
      regimenIgv: REGIMEN_IGV_POR_DEFECTO,
      leyendaPie: null,
      usuarioProveedor: null,
      secretoCredencialId: null,
      secretoCertificadoId: null,
      secretoClaveCertificadoId: null,
      certificado: null,
      urlProveedor: null,
      pruebasEnviadas: PRUEBAS_INICIALES,
      prueba: null,
      produccionHabilitadaEn: null,
      produccionHabilitadaPor: null,
      version: VERSION_INICIAL_EMISOR,
      creadoPor: datos.creadoPor,
      creadoEn: datos.ahora,
      modificadoPor: null,
      modificadoEn: null,
    });
  }

  static reconstituir(props: EmisorProps): Emisor {
    return new Emisor({ ...props, certificado: props.certificado && { ...props.certificado }, prueba: props.prueba && { ...props.prueba } });
  }

  get id(): string {
    return this.props.id;
  }

  get version(): number {
    return this.props.version;
  }

  get empresaId(): string {
    return this.props.empresaId;
  }

  get proveedor(): string {
    return this.props.proveedor;
  }

  get secretoCredencialId(): string | null {
    return this.props.secretoCredencialId;
  }

  get secretosCertificado(): SecretosCertificado | null {
    const { secretoCertificadoId, secretoClaveCertificadoId } = this.props;
    if (secretoCertificadoId === null || secretoClaveCertificadoId === null) return null;
    return { certificadoId: secretoCertificadoId, claveId: secretoClaveCertificadoId };
  }

  get certificado(): CertificadoEmisor | null {
    return this.props.certificado && { ...this.props.certificado };
  }

  get ambiente(): AmbienteEmisor {
    return this.props.ambiente;
  }

  get urlProveedor(): string | null {
    return this.props.urlProveedor;
  }

  get usuarioProveedor(): string | null {
    return this.props.usuarioProveedor;
  }

  get prueba(): PruebaEmisor | null {
    return this.props.prueba && { ...this.props.prueba };
  }

  get regimenIgv(): RegimenIgv {
    return this.props.regimenIgv;
  }

  /** TR-RF-053: se emite en beta tras la prueba aceptada (VERIFICADO) o en PRODUCCION (spec 51). */
  exigirHabilitadoParaEmitir(): void {
    if (!ESTADOS_QUE_EMITEN.includes(this.props.estado)) throw new EmisorNoHabilitadoError();
  }

  /** Copia de las propiedades para el mapeo a la fila y las vistas. */
  get datos(): Readonly<EmisorProps> {
    return { ...this.props, certificado: this.certificado, prueba: this.prueba };
  }

  /**
   * En PRODUCCION no se cambia de proveedor ni de URL (EmisorEnProduccionError). En VERIFICADO, cambiarlos invalida
   * la prueba y el emisor vuelve a CONFIGURADO.
   */
  configurarProveedor(configuracion: ConfiguracionProveedor): void {
    const proveedor = exigirTexto(configuracion.proveedor, LARGO_MAXIMO_PROVEEDOR, 'El proveedor');
    const cambiaConexion = proveedor !== this.props.proveedor || configuracion.urlProveedor !== this.props.urlProveedor;
    if (cambiaConexion && this.props.estado === 'PRODUCCION') throw new EmisorEnProduccionError();
    this.props.proveedor = proveedor;
    this.props.urlProveedor = configuracion.urlProveedor;
    this.props.usuarioProveedor = exigirTexto(configuracion.usuarioProveedor, LARGO_MAXIMO_USUARIO, 'El usuario del proveedor');
    this.props.regimenIgv = exigirRegimen(configuracion.regimenIgv);
    this.props.leyendaPie = exigirLeyenda(configuracion.leyendaPie);
    if (cambiaConexion) this.invalidarVerificacion();
  }

  /** En PRODUCCION la rotación no interrumpe (TR-RNF-113); en VERIFICADO invalida la prueba. */
  asignarCredencial(secretoId: string): void {
    this.props.secretoCredencialId = secretoId;
    this.invalidarVerificacion();
  }

  /**
   * El certificado ya pasó `validarPara`: aquí solo se guardan sus datos públicos y los ids de la bóveda. Como la
   * credencial: se rota en PRODUCCION sin interrumpir e invalida la prueba de un emisor VERIFICADO.
   */
  asignarCertificado(certificadoLeido: CertificadoLeido, secretos: SecretosCertificado): void {
    this.invalidarVerificacion();
    this.props.certificado = {
      ruc: certificadoLeido.ruc,
      venceEn: certificadoLeido.venceEn,
      huellaSha256: certificadoLeido.huellaSha256,
    };
    this.props.secretoCertificadoId = secretos.certificadoId;
    this.props.secretoClaveCertificadoId = secretos.claveId;
  }

  /**
   * CONFIGURADO con proveedor, usuario, credencial y, si el proveedor lo pide, certificado vigente en `ahora`;
   * si no, BORRADOR. Devuelve si pasó de BORRADOR a CONFIGURADO, para publicar `fe.emisor.configurado`.
   */
  recalcularEstado(requiereCertificado: boolean, ahora: Date): boolean {
    if (!ESTADOS_DE_CONFIGURACION.includes(this.props.estado)) return false;
    const anterior = this.props.estado;
    this.props.estado = this.estaCompleto(requiereCertificado, ahora) ? 'CONFIGURADO' : 'BORRADOR';
    return anterior === 'BORRADOR' && this.props.estado === 'CONFIGURADO';
  }

  /**
   * TR-RF-052, paso 4: suma el correlativo de prueba propio, deja la prueba EN_PROCESO y devuelve su número. Una
   * prueba EN_PROCESO de menos de PRUEBA_ATASCADA_MINUTOS impide otra; pasado ese tiempo, la vieja se ignora.
   */
  solicitarPrueba(ahora: Date): number {
    if (!ESTADOS_QUE_PIDEN_PRUEBA.includes(this.props.estado)) throw new EstadoEmisorInvalidoError();
    if (this.tienePruebaEnCurso(ahora)) throw new PruebaEnCursoError();
    this.props.pruebasEnviadas += 1;
    this.props.prueba = {
      estado: 'EN_PROCESO',
      numero: this.props.pruebasEnviadas,
      solicitadaEn: ahora,
      resultadoEn: null,
      codigo: null,
      descripcion: null,
    };
    return this.props.pruebasEnviadas;
  }

  /** La prueba `numero` es la última y sigue esperando su resultado. */
  esperaResultadoDe(numero: number): boolean {
    return this.props.prueba?.numero === numero && this.props.prueba.estado === 'EN_PROCESO';
  }

  /**
   * Resultado de la prueba `numero`; se ignora si no es la última o ya tiene resultado (prueba vieja o repetida) y
   * si el PSE la dejó EN_PROCESO. ERROR_TECNICO solo llega aquí cuando se agotaron los reintentos. Devuelve si el
   * emisor pasó de CONFIGURADO a VERIFICADO, para publicar `fe.emisor.verificado`.
   */
  registrarResultadoPrueba(numero: number, respuesta: RespuestaPse, ahora: Date): boolean {
    const prueba = this.props.prueba;
    if (!prueba || !this.esperaResultadoDe(numero) || respuesta.resultado === 'EN_PROCESO') return false;
    prueba.estado = estadoPruebaDe(respuesta.resultado);
    prueba.resultadoEn = ahora;
    prueba.codigo = recortar(respuesta.codigo, LARGO_MAXIMO_CODIGO_PRUEBA);
    prueba.descripcion = recortar(respuesta.descripcion, LARGO_MAXIMO_DESCRIPCION_PRUEBA);
    if (prueba.estado !== 'ACEPTADA' || this.props.estado !== 'CONFIGURADO') return false;
    this.props.estado = 'VERIFICADO';
    return true;
  }

  /**
   * TR-RF-052, paso 5. Falla en orden: entorno, simulador, prueba aceptada en las últimas VIGENCIA_PRUEBA_HORAS y
   * certificado vigente si el proveedor lo pide. Deja estado y ambiente en PRODUCCION.
   */
  habilitarProduccion(ahora: Date, reglas: ReglasProduccion, actorId: string): void {
    if (!reglas.produccionPermitida) throw new ProduccionNoPermitidaError();
    if (reglas.esSimulado) throw new ProveedorSimuladoEnProduccionError();
    if (this.props.estado !== 'VERIFICADO' || !this.tienePruebaAceptadaVigente(ahora)) throw new PruebaBetaRequeridaError();
    if (reglas.requiereCertificado && !this.tieneCertificadoVigente(ahora)) throw new CertificadoVencidoError();
    this.props.estado = 'PRODUCCION';
    this.props.ambiente = 'PRODUCCION';
    this.props.produccionHabilitadaEn = ahora;
    this.props.produccionHabilitadaPor = actorId;
  }

  /** Cada cambio guardado sube la versión una vez; el repositorio filtra por la anterior. */
  registrarModificacion(actorId: string, ahora: Date): void {
    this.props.modificadoPor = actorId;
    this.registrarModificacionDelSistema(ahora);
  }

  /** Cambios del worker (resultado de la prueba): sin usuario, `modificado_por` queda el del último cambio. */
  registrarModificacionDelSistema(ahora: Date): void {
    this.props.version += 1;
    this.props.modificadoEn = ahora;
  }

  cargaConfigurado(): EmisorConfigurado {
    return { emisor_id: this.props.id, empresa_id: this.props.empresaId, proveedor: this.props.proveedor, ambiente: this.props.ambiente };
  }

  cargaCambioEstado(): CambioEstadoEmisor {
    return { emisor_id: this.props.id, empresa_id: this.props.empresaId, proveedor: this.props.proveedor };
  }

  /** Una prueba solo vale para la configuración con la que se hizo. */
  private invalidarVerificacion(): void {
    if (this.props.estado !== 'VERIFICADO') return;
    this.props.estado = 'CONFIGURADO';
    this.props.prueba = null;
  }

  private tienePruebaEnCurso(ahora: Date): boolean {
    const prueba = this.props.prueba;
    return prueba?.estado === 'EN_PROCESO' && minutosEntre(prueba.solicitadaEn, ahora) < PRUEBA_ATASCADA_MINUTOS;
  }

  private tienePruebaAceptadaVigente(ahora: Date): boolean {
    const resultadoEn = this.props.prueba?.estado === 'ACEPTADA' ? this.props.prueba.resultadoEn : null;
    return resultadoEn !== null && minutosEntre(resultadoEn, ahora) <= VIGENCIA_PRUEBA_HORAS * MINUTOS_POR_HORA;
  }

  private tieneCertificadoVigente(ahora: Date): boolean {
    const certificado = this.props.certificado;
    return certificado !== null && certificado.venceEn.getTime() > ahora.getTime();
  }

  private estaCompleto(requiereCertificado: boolean, ahora: Date): boolean {
    const { proveedor, usuarioProveedor, secretoCredencialId } = this.props;
    if (!proveedor || usuarioProveedor === null || secretoCredencialId === null) return false;
    return !requiereCertificado || this.tieneCertificadoVigente(ahora);
  }
}
