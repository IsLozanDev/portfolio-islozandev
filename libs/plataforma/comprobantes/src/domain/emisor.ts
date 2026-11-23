import type { CertificadoLeido } from './certificado-leido.js';
import { DatosEmisorInvalidosError } from './errores.js';
import { AMBIENTE_INICIAL, type AmbienteEmisor, type EstadoEmisor } from './estado-emisor.js';
import type { EmisorConfigurado } from './eventos-fe.js';
import { esRegimenIgv, REGIMEN_IGV_POR_DEFECTO, type RegimenIgv } from './regimen-igv.js';

/** Los mismos largos que las columnas de fe.emisor. */
export const LARGO_MAXIMO_PROVEEDOR = 40;
export const LARGO_MAXIMO_USUARIO = 100;
export const LARGO_MAXIMO_LEYENDA = 300;
export const VERSION_INICIAL_EMISOR = 1;

/** El certificado vigente del emisor: sus datos públicos. El .pfx y su clave están en la bóveda. */
export interface CertificadoEmisor {
  ruc: string;
  venceEn: Date;
  huellaSha256: string;
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
}

/** Estados entre los que se mueve el emisor en el spec 49; VERIFICADO y PRODUCCION son del spec 50. */
const ESTADOS_DE_CONFIGURACION: readonly EstadoEmisor[] = ['BORRADOR', 'CONFIGURADO'];

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
 * Emisor electrónico de una empresa (TR-RF-052, pasos 1 a 3): proveedor PSE, su credencial y el certificado,
 * con los secretos en la bóveda. `version` es la de la fila y el bloqueo optimista.
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
      version: VERSION_INICIAL_EMISOR,
      creadoPor: datos.creadoPor,
      creadoEn: datos.ahora,
      modificadoPor: null,
      modificadoEn: null,
    });
  }

  static reconstituir(props: EmisorProps): Emisor {
    return new Emisor({ ...props, certificado: props.certificado && { ...props.certificado } });
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

  /** Copia de las propiedades para el mapeo a la fila y las vistas. */
  get datos(): Readonly<EmisorProps> {
    return { ...this.props, certificado: this.certificado };
  }

  configurarProveedor(configuracion: ConfiguracionProveedor): void {
    this.props.proveedor = exigirTexto(configuracion.proveedor, LARGO_MAXIMO_PROVEEDOR, 'El proveedor');
    this.props.usuarioProveedor = exigirTexto(configuracion.usuarioProveedor, LARGO_MAXIMO_USUARIO, 'El usuario del proveedor');
    this.props.regimenIgv = exigirRegimen(configuracion.regimenIgv);
    this.props.leyendaPie = exigirLeyenda(configuracion.leyendaPie);
  }

  asignarCredencial(secretoId: string): void {
    this.props.secretoCredencialId = secretoId;
  }

  /** El certificado ya pasó `validarPara`: aquí solo se guardan sus datos públicos y los ids de la bóveda. */
  asignarCertificado(certificadoLeido: CertificadoLeido, secretos: SecretosCertificado): void {
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

  /** Cada cambio guardado sube la versión una vez; el repositorio filtra por la anterior. */
  registrarModificacion(actorId: string, ahora: Date): void {
    this.props.version += 1;
    this.props.modificadoPor = actorId;
    this.props.modificadoEn = ahora;
  }

  cargaConfigurado(): EmisorConfigurado {
    return { emisor_id: this.props.id, empresa_id: this.props.empresaId, proveedor: this.props.proveedor, ambiente: this.props.ambiente };
  }

  private estaCompleto(requiereCertificado: boolean, ahora: Date): boolean {
    const { proveedor, usuarioProveedor, secretoCredencialId, certificado } = this.props;
    if (!proveedor || usuarioProveedor === null || secretoCredencialId === null) return false;
    if (!requiereCertificado) return true;
    return certificado !== null && certificado.venceEn.getTime() > ahora.getTime();
  }
}
