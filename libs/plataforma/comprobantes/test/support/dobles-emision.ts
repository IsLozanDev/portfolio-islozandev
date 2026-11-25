import type { AtributosItem, CatalogoPort, ResultadoValidacion } from '@vitrina/plataforma/catalogos';
import type { CorrelativoPort, NumeroEmitido, SeriesActivasPort, SolicitudNumero, TipoDocumento } from '@vitrina/plataforma/correlativos';
import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { DatosPadron, PadronRucPort } from '@vitrina/plataforma/org';
import type { ParametroPort } from '@vitrina/plataforma/parametros';
import type { DependenciasEmision } from '../../src/application/emitir-comprobante.js';
import type { SucursalesEmisoras } from '../../src/application/ports/reglas-emision.js';
import type { RepositorioComprobantes } from '../../src/application/ports/repositorio-comprobantes.js';
import { Comprobante } from '../../src/domain/comprobante/comprobante.js';
import { Emisor } from '../../src/domain/emisor.js';
import type { EstadoEmisor } from '../../src/domain/estado-emisor.js';
import { EmisionConcurrenteError, SucursalNoEncontradaError } from '../../src/domain/errores.js';
import type { RegimenIgv } from '../../src/domain/regimen-igv.js';
import { CatalogosSunatCatalogo } from '../../src/infrastructure/catalogos/catalogos-sunat.catalogo.js';
import { TasaIgvCatalogo } from '../../src/infrastructure/catalogos/tasa-igv.catalogo.js';
import { PadronAdquirenteOrg } from '../../src/infrastructure/org/padron-adquirente.org.js';
import { UmbralBoletaParametros } from '../../src/infrastructure/parametros/umbral-boleta.parametros.js';
import { AHORA, crearDobles, EMPRESA, EMPRESA_DE_B, TENANT_A, TENANT_B, USUARIO, type Dobles } from './dobles.js';

export const SUCURSAL = '5c000000-0000-4000-8000-000000000001';
export const SUCURSAL_2 = '5c000000-0000-4000-8000-000000000002';
export const SUCURSAL_DE_B = '5c000000-0000-4000-8000-000000000003';
/** Con dígito verificador válido (módulo 11). */
export const RUC_CLIENTE = '20512345671';
export const RUC_NO_HABIDO = '20100070970';
export const RUC_CAIDO = '20131312955';

/** Como la semilla de 01u_fe_comprobante y los ítems que el importador carga de docs/datos-oficiales. */
const ITEMS_DE_PRUEBA: Record<string, Record<string, AtributosItem>> = {
  UNIDAD_MEDIDA: { NIU: {}, ZZ: {} },
  MONEDA: { PEN: {}, USD: {} },
  TIPO_DOC_IDENTIDAD: { DNI: {}, RUC: {}, DOC_0: {}, CE: {} },
  AFECTACION_IGV: {
    '10': { grupo: 'GRAVADO', oneroso: true },
    '11': { grupo: 'GRAVADO', oneroso: false },
    '17': { grupo: 'IVAP', oneroso: true },
    '20': { grupo: 'EXONERADO', oneroso: true },
    '30': { grupo: 'INAFECTO', oneroso: true },
  },
  TASA_IGV: { GENERAL: { tasa: '0.18' }, REDUCIDO_RESTAURANTES: { tasa: '0.105' } },
};

/** CatalogoPort con los ítems vigentes hoy; `items` se cambia en la prueba para simular otra vigencia. */
export class CatalogoMemoria implements CatalogoPort {
  items: Record<string, Record<string, AtributosItem>> = structuredClone(ITEMS_DE_PRUEBA);
  consultas = 0;

  validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion> {
    this.consultas += 1;
    const atributos = this.items[catalogo]?.[codigo];
    return Promise.resolve(
      atributos ? { valido: true, motivo: null, atributos, nombre: codigo } : { valido: false, motivo: 'INEXISTENTE', atributos: null, nombre: null },
    );
  }
}

export class ParametrosMemoria implements Pick<ParametroPort, 'valor'> {
  umbral = 700;
  valor<T>(): Promise<{ valor: T; origen: 'DEFECTO' }> {
    return Promise.resolve({ valor: this.umbral as T, origen: 'DEFECTO' });
  }
}

export class PadronMemoria implements PadronRucPort {
  readonly datos = new Map<string, DatosPadron>([[RUC_NO_HABIDO, { razonSocial: 'X', estado: 'SUSPENSION TEMPORAL', condicion: 'NO HABIDO' }]]);
  consultar(ruc: string): Promise<DatosPadron | null> {
    if (ruc === RUC_CAIDO) return Promise.reject(new Error('padrón caído'));
    return Promise.resolve(this.datos.get(ruc) ?? null);
  }
}

interface SerieMemoria {
  tenantId: string;
  empresaId: string;
  sucursalId: string;
  tipo: TipoDocumento;
  serie: string;
  ultimo: number;
  activa: boolean;
}

/** SEQ en memoria: el número vuelve atrás si la transacción se revierte (TR-CA-095). */
export class SeriesMemoria implements SeriesActivasPort, CorrelativoPort {
  series: SerieMemoria[] = [];
  pedidos = 0;
  constructor(private readonly contexto: TenantContext) {}

  deSucursal(sucursalId: string, tipo: TipoDocumento): Promise<string[]> {
    const tenantId = this.contexto.current().tenantId;
    return Promise.resolve(
      this.series
        .filter((serie) => serie.tenantId === tenantId && serie.sucursalId === sucursalId && serie.tipo === tipo && serie.activa)
        .map((serie) => serie.serie)
        .sort(),
    );
  }

  siguiente({ empresaId, tipo, serie }: SolicitudNumero): Promise<NumeroEmitido> {
    this.pedidos += 1;
    const tenantId = this.contexto.current().tenantId;
    const encontrada = this.series.find((candidata) => candidata.tenantId === tenantId && candidata.empresaId === empresaId && candidata.tipo === tipo && candidata.serie === serie);
    if (!encontrada) throw new Error('serie inexistente');
    encontrada.ultimo += 1;
    return Promise.resolve({ serie, numero: BigInt(encontrada.ultimo), numeroFormateado: `${serie}-${String(encontrada.ultimo).padStart(8, '0')}` });
  }

  ultimo(serie: string): number | undefined {
    return this.series.find((candidata) => candidata.serie === serie && candidata.tenantId === TENANT_A)?.ultimo;
  }

  instantanea(): () => void {
    const antes = this.series.map((serie) => ({ ...serie }));
    return () => (this.series = antes);
  }
}

export class SucursalesMemoria implements SucursalesEmisoras {
  readonly sucursales = new Map([
    [SUCURSAL, { tenantId: TENANT_A, empresaId: EMPRESA, codigoEstablecimiento: '0000' as string | null }],
    [SUCURSAL_2, { tenantId: TENANT_A, empresaId: EMPRESA, codigoEstablecimiento: null }],
    [SUCURSAL_DE_B, { tenantId: TENANT_B, empresaId: EMPRESA_DE_B, codigoEstablecimiento: '0000' }],
  ]);
  constructor(private readonly contexto: TenantContext) {}

  exigirDeLaEmpresa(sucursalId: string, empresaId: string): Promise<void> {
    const sucursal = this.sucursales.get(sucursalId);
    if (!sucursal || sucursal.tenantId !== this.contexto.current().tenantId || sucursal.empresaId !== empresaId) {
      return Promise.reject(new SucursalNoEncontradaError());
    }
    return Promise.resolve();
  }

  codigoEstablecimiento(sucursalId: string): Promise<string | null> {
    const sucursal = this.sucursales.get(sucursalId);
    if (!sucursal || sucursal.tenantId !== this.contexto.current().tenantId) return Promise.reject(new SucursalNoEncontradaError());
    return Promise.resolve(sucursal.codigoEstablecimiento);
  }
}

/** Guarda copias, como la base; la clave repetida es la de uq_comprobante_idempotencia. */
export class ComprobantesMemoria implements RepositorioComprobantes {
  filas: Comprobante[] = [];
  constructor(private readonly contexto: TenantContext) {}

  porClave(claveIdempotencia: string): Promise<Comprobante | null> {
    return Promise.resolve(this.copia(this.delTenant().find((comprobante) => comprobante.datos.claveIdempotencia === claveIdempotencia)));
  }

  porId(comprobanteId: string): Promise<Comprobante | null> {
    return Promise.resolve(this.copia(this.delTenant().find((comprobante) => comprobante.id === comprobanteId)));
  }

  guardar(comprobante: Comprobante): Promise<void> {
    if (this.delTenant().some((otro) => otro.datos.claveIdempotencia === comprobante.datos.claveIdempotencia)) {
      return Promise.reject(new EmisionConcurrenteError());
    }
    this.filas.push(Comprobante.reconstituir({ ...comprobante.datos }));
    return Promise.resolve();
  }

  instantanea(): () => void {
    const antes = [...this.filas];
    return () => (this.filas = antes);
  }

  private delTenant(): Comprobante[] {
    const tenantId = this.contexto.current().tenantId;
    return this.filas.filter((comprobante) => comprobante.datos.tenantId === tenantId);
  }

  private copia(comprobante: Comprobante | undefined): Comprobante | null {
    return comprobante ? Comprobante.reconstituir({ ...comprobante.datos }) : null;
  }
}

export interface DoblesEmision extends DependenciasEmision {
  base: Dobles;
  unidadDeTrabajo: Dobles['unidadDeTrabajo'];
  contexto: Dobles['contexto'];
  publicador: Dobles['publicador'];
  emisores: Dobles['emisores'];
  catalogo: CatalogoMemoria;
  parametros: ParametrosMemoria;
  seriesMemoria: SeriesMemoria;
  comprobantes: ComprobantesMemoria;
  avisos: string[];
}

export function emisorEn(estado: EstadoEmisor, regimenIgv: RegimenIgv = 'GENERAL', tenantId = TENANT_A, empresaId = EMPRESA): Emisor {
  const creado = Emisor.crear({ id: `e-${tenantId}-${empresaId}`, tenantId, empresaId, creadoPor: USUARIO, ahora: new Date(AHORA) });
  return Emisor.reconstituir({ ...creado.datos, estado, ambiente: estado === 'PRODUCCION' ? 'PRODUCCION' : 'BETA', regimenIgv });
}

function serie(tipo: TipoDocumento, codigo: string, ultimo: number, sucursalId = SUCURSAL, tenantId = TENANT_A, empresaId = EMPRESA): SerieMemoria {
  return { tenantId, empresaId, sucursalId, tipo, serie: codigo, ultimo, activa: true };
}

/** Emisor VERIFICADO con régimen GENERAL; F001 en 99 (TR-CA-136) y B001 en 0 en la sucursal; F002 en la sucursal 2. */
export function crearDoblesEmision(): DoblesEmision {
  const base = crearDobles();
  const catalogo = new CatalogoMemoria();
  const parametros = new ParametrosMemoria();
  const seriesMemoria = new SeriesMemoria(base.contexto);
  const comprobantes = new ComprobantesMemoria(base.contexto);
  const avisos: string[] = [];
  base.unidadDeTrabajo.participar(seriesMemoria, comprobantes);
  base.emisores.filas = [emisorEn('VERIFICADO'), emisorEn('VERIFICADO', 'GENERAL', TENANT_B, EMPRESA_DE_B)];
  seriesMemoria.series = [
    serie('FACTURA', 'F001', 99),
    serie('BOLETA', 'B001', 0),
    serie('FACTURA', 'F002', 0, SUCURSAL_2),
    serie('FACTURA', 'F001', 0, SUCURSAL_DE_B, TENANT_B, EMPRESA_DE_B),
  ];
  return {
    base,
    unidadDeTrabajo: base.unidadDeTrabajo,
    contexto: base.contexto,
    reloj: base.reloj,
    ids: base.ids,
    publicador: base.publicador,
    emisores: base.emisores,
    sucursales: new SucursalesMemoria(base.contexto),
    series: seriesMemoria,
    correlativo: seriesMemoria,
    catalogos: new CatalogosSunatCatalogo(catalogo),
    tasas: new TasaIgvCatalogo(catalogo),
    umbral: new UmbralBoletaParametros(parametros),
    padron: new PadronAdquirenteOrg(new PadronMemoria(), (mensaje) => avisos.push(mensaje)),
    comprobantes,
    catalogo,
    parametros,
    seriesMemoria,
    avisos,
  };
}
