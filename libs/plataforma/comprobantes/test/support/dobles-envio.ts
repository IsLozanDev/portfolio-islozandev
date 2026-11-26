import type { DependenciasEnvio } from '../../src/application/enviar-comprobante.js';
import type { ArchivosCpe } from '../../src/application/ports/archivos-cpe.js';
import type { CredencialesPse, PseOsePort } from '../../src/application/ports/pse-ose.port.js';
import type { RepositorioEnvios } from '../../src/application/ports/repositorio-envios.js';
import type { DocumentoElectronico } from '../../src/domain/documento-electronico.js';
import { Emisor } from '../../src/domain/emisor.js';
import type { EstadoEmisor } from '../../src/domain/estado-emisor.js';
import type { IntentoEnvio } from '../../src/domain/envio/intento-envio.js';
import type { RespuestaPse } from '../../src/domain/respuesta-pse.js';
import { ResolutorPseMapa } from '../../src/infrastructure/pse/resolutor-pse.js';
import { PseSimulador } from '../../src/infrastructure/pse/simulador/pse.simulador.js';
import { EMPRESA, NUBEFACT, SIMULADO, TENANT_A, URL_SIMULADOR, type Dobles } from './dobles.js';
import { crearDoblesEmision, emisorEn, SUCURSAL, SucursalesMemoria, type DoblesEmision } from './dobles-emision.js';

/** El token con el que el simulador acepta. */
export const TOKEN_ACEPTA = 'token-del-simulador';
/** Anexo SUNAT de la sucursal del comprobante, distinto del de la principal (0001). */
export const ANEXO_SUCURSAL = '0003';
const DOMICILIO_FISCAL = 'AV. LARCO 123, MIRAFLORES';
const UBIGEO = '150122';

/** fe.envio en memoria, con el UNIQUE (comprobante_id, intento). */
export class EnviosMemoria implements RepositorioEnvios {
  filas: IntentoEnvio[] = [];

  siguienteIntento(comprobanteId: string): Promise<number> {
    const intentos = this.filas.filter((fila) => fila.comprobanteId === comprobanteId).map((fila) => fila.intento);
    return Promise.resolve(Math.max(0, ...intentos) + 1);
  }

  registrar(intento: IntentoEnvio): Promise<void> {
    if (this.filas.some((fila) => fila.comprobanteId === intento.comprobanteId && fila.intento === intento.intento)) {
      return Promise.reject(new Error('uq_envio_intento'));
    }
    this.filas.push({ ...intento });
    return Promise.resolve();
  }

  instantanea(): () => void {
    const antes = [...this.filas];
    return () => (this.filas = antes);
  }

  de(comprobanteId: string): IntentoEnvio[] {
    return this.filas.filter((fila) => fila.comprobanteId === comprobanteId);
  }
}

interface ArchivoGuardadoEnMemoria {
  archivoId: string;
  comprobanteId: string;
  tipo: 'XML' | 'CDR';
  bytes: Uint8Array;
}

/** ARC en memoria; con `caido` devuelve null, como el adaptador tras agotar sus reintentos. */
export class ArchivosCpeMemoria implements ArchivosCpe {
  guardados: ArchivoGuardadoEnMemoria[] = [];
  caido = false;

  guardarXml(comprobanteId: string, _documento: DocumentoElectronico, xml: Uint8Array): Promise<string | null> {
    return this.guardar(comprobanteId, 'XML', xml);
  }

  guardarCdr(comprobanteId: string, _documento: DocumentoElectronico, cdr: Uint8Array): Promise<string | null> {
    return this.guardar(comprobanteId, 'CDR', cdr);
  }

  private guardar(comprobanteId: string, tipo: 'XML' | 'CDR', bytes: Uint8Array): Promise<string | null> {
    if (this.caido) return Promise.resolve(null);
    const archivoId = `0193f3a0-0000-7000-8000-${String(this.guardados.length + 1).padStart(12, '0')}`;
    this.guardados.push({ archivoId, comprobanteId, tipo, bytes });
    return Promise.resolve(archivoId);
  }
}

/** El simulador real, registrando cada documento que recibe. */
export class PseEspia implements PseOsePort {
  readonly documentos: DocumentoElectronico[] = [];
  private readonly simulador = new PseSimulador();

  enviarComprobante(credenciales: CredencialesPse, documento: DocumentoElectronico): Promise<RespuestaPse> {
    this.documentos.push(documento);
    return this.simulador.enviarComprobante(credenciales, documento);
  }
}

export interface Registro {
  nivel: 'informar' | 'avisar';
  mensaje: string;
  datos: Record<string, unknown>;
}

export interface DoblesEnvio extends DependenciasEnvio {
  emision: DoblesEmision;
  unidadDeTrabajo: Dobles['unidadDeTrabajo'];
  contexto: Dobles['contexto'];
  publicador: Dobles['publicador'];
  envios: EnviosMemoria;
  archivos: ArchivosCpeMemoria;
  pse: PseEspia;
  registros: Registro[];
  /** Deja al emisor con otro proveedor o estado; la credencial sigue en la bóveda. */
  configurarEmisor(cambios: { proveedor?: string; estado?: EstadoEmisor; token?: string }): Promise<void>;
}

/**
 * Sobre los dobles de la emisión: la empresa con domicilio y ubigeo, la sucursal con su anexo y el emisor
 * VERIFICADO con el simulador y su token en la bóveda.
 */
export async function crearDoblesEnvio(): Promise<DoblesEnvio> {
  const emision = crearDoblesEmision();
  const { base } = emision;
  const empresa = base.empresas.empresas.get(EMPRESA);
  if (empresa) base.empresas.empresas.set(EMPRESA, { ...empresa, domicilioFiscal: DOMICILIO_FISCAL, ubigeo: UBIGEO });
  const sucursales = new SucursalesMemoria(base.contexto);
  const sucursal = sucursales.sucursales.get(SUCURSAL);
  if (sucursal) sucursal.codigoEstablecimiento = ANEXO_SUCURSAL;
  const envios = new EnviosMemoria();
  const archivos = new ArchivosCpeMemoria();
  const pse = new PseEspia();
  const registros: Registro[] = [];
  base.unidadDeTrabajo.participar(envios);
  const secretoCredencialId = await base.boveda.guardar('fe.credencial', new TextEncoder().encode(TOKEN_ACEPTA));

  const configurarEmisor = async ({ proveedor = SIMULADO, estado = 'VERIFICADO', token }: { proveedor?: string; estado?: EstadoEmisor; token?: string }) => {
    if (token !== undefined) await base.boveda.rotar(secretoCredencialId, new TextEncoder().encode(token));
    const emisor = emisorEn(estado);
    const urlProveedor = proveedor === NUBEFACT ? 'https://api.nubefact.com/api/v1/ruta' : URL_SIMULADOR;
    base.emisores.filas = [
      Emisor.reconstituir({ ...emisor.datos, proveedor, secretoCredencialId, urlProveedor }),
      ...base.emisores.filas.filter((otro) => otro.datos.tenantId !== TENANT_A),
    ];
  };
  await configurarEmisor({});

  return {
    emision,
    unidadDeTrabajo: base.unidadDeTrabajo,
    contexto: base.contexto,
    reloj: base.reloj,
    ids: base.ids,
    publicador: base.publicador,
    comprobantes: emision.comprobantes,
    envios,
    emisores: base.emisores,
    empresas: base.empresas,
    sucursales,
    catalogos: emision.catalogos,
    proveedores: base.proveedores,
    boveda: base.boveda,
    resolutor: new ResolutorPseMapa({ [SIMULADO]: pse, [NUBEFACT]: pse }),
    archivos,
    informar: (mensaje, datos) => registros.push({ nivel: 'informar', mensaje, datos }),
    avisar: (mensaje, datos) => registros.push({ nivel: 'avisar', mensaje, datos }),
    pse,
    registros,
    configurarEmisor,
  };
}
