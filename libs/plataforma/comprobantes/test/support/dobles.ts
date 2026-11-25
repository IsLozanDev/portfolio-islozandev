import type { AuditoriaPort, EntradaAuditoria } from '@vitrina/plataforma/auditoria';
import type { Clock, DomainEvent, EventPublisher, IdGenerator, TenantContext, TenantScope, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import type { DependenciasAvisos } from '../../src/application/avisar-certificados-por-vencer.js';
import type { DependenciasEmisor } from '../../src/application/dependencias-fe.js';
import type { EmpresaEmisora, EmpresaEmisoraPort } from '../../src/application/ports/empresa-emisora.port.js';
import type { ProveedorFe, ProveedoresFe } from '../../src/application/ports/proveedores-fe.js';
import type { EmisorPendienteDeAviso, RepositorioAvisosCertificado } from '../../src/application/ports/repositorio-avisos-certificado.js';
import type { RepositorioEmisores } from '../../src/application/ports/repositorio-emisores.js';
import type { AvisoCertificado } from '../../src/domain/aviso-certificado.js';
import { Emisor } from '../../src/domain/emisor.js';
import { EmpresaNoEncontradaError, ProveedorFeInvalidoError, VersionObsoletaEmisorError } from '../../src/domain/errores.js';
import { LectorCertificadoForge } from '../../src/infrastructure/forge/lector-certificado.forge.js';
import { RUC_EMPRESA } from './certificados.js';

export const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
export const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
export const USUARIO = 'cccccccc-0000-4000-8000-000000000003';
export const EMPRESA = 'eeeeeeee-0000-4000-8000-000000000001';
export const EMPRESA_INACTIVA = 'eeeeeeee-0000-4000-8000-000000000002';
export const EMPRESA_DE_B = 'eeeeeeee-0000-4000-8000-000000000003';
export const AHORA = '2026-11-22T15:00:00.000Z';
export const SIMULADO = 'SIMULADO';
export const SIN_CERTIFICADO = 'SIN_CERTIFICADO';
export const NUBEFACT = 'NUBEFACT';
/** Como la semilla de 01r_fe_prueba. */
export const URL_SIMULADOR = 'https://simulador.invalid/api/v1/ruta-demo';
export const URL_NUBEFACT = 'https://api.nubefact.com/api/v1/48239908-7ae7-4353-824d-071765d4';

/** Lo que una transacción deshace si falla. */
interface Transaccional {
  instantanea(): () => void;
}

export class ContextoFijo implements TenantContext {
  constructor(public alcance: TenantScope) {}
  current(): TenantScope {
    return this.alcance;
  }
  run<Resultado>(alcance: TenantScope, trabajo: () => Promise<Resultado>): Promise<Resultado> {
    const anterior = this.alcance;
    this.alcance = alcance;
    return trabajo().finally(() => {
      this.alcance = anterior;
    });
  }
}

/** Como la base: si el trabajo de la transacción externa lanza, deshace lo que escribieron los dobles. */
export class UnidadDeTrabajoMemoria implements UnitOfWork {
  enCurso = 0;
  private readonly participantes: Transaccional[] = [];

  participar(...participantes: Transaccional[]): void {
    this.participantes.push(...participantes);
  }

  async run<Resultado>(trabajo: () => Promise<Resultado>): Promise<Resultado> {
    if (this.enCurso > 0) return trabajo();
    const deshacer = this.participantes.map((participante) => participante.instantanea());
    this.enCurso += 1;
    try {
      return await trabajo();
    } catch (error) {
      for (const restaurar of deshacer) restaurar();
      throw error;
    } finally {
      this.enCurso -= 1;
    }
  }
}

export class RelojFijo implements Clock {
  instante = new Date(AHORA);
  now(): Date {
    return new Date(this.instante);
  }
}

export class IdsEnOrden implements IdGenerator {
  private entregados = 0;
  next(): string {
    this.entregados += 1;
    return `00000000-0000-4000-8000-${String(this.entregados).padStart(12, '0')}`;
  }
}

export class PublicadorMemoria implements EventPublisher, Transaccional {
  eventos: DomainEvent[] = [];
  readonly enTransaccion: boolean[] = [];
  constructor(private readonly unidadDeTrabajo: UnidadDeTrabajoMemoria) {}

  publish(evento: DomainEvent): Promise<void> {
    this.eventos.push(evento);
    this.enTransaccion.push(this.unidadDeTrabajo.enCurso > 0);
    return Promise.resolve();
  }

  instantanea(): () => void {
    const antes = [...this.eventos];
    return () => (this.eventos = antes);
  }

  tipos(): string[] {
    return this.eventos.map((evento) => evento.eventType);
  }
}

export class AuditoriaMemoria implements AuditoriaPort, Transaccional {
  entradas: EntradaAuditoria[] = [];

  registrar(entrada: EntradaAuditoria): Promise<void> {
    this.entradas.push(entrada);
    return Promise.resolve();
  }

  registrarAccesoSensible(): Promise<void> {
    return Promise.resolve();
  }

  instantanea(): () => void {
    const antes = [...this.entradas];
    return () => (this.entradas = antes);
  }
}

export interface SecretoMemoria {
  tenantId: string;
  tipo: string;
  valor: Uint8Array;
  version: number;
}

export class BovedaMemoria implements BovedaSecretos, Transaccional {
  secretos = new Map<string, SecretoMemoria>();
  private siguiente = 0;
  constructor(private readonly contexto: TenantContext) {}

  guardar(tipo: string, valor: Uint8Array): Promise<string> {
    this.siguiente += 1;
    const id = `5ec00000-0000-4000-8000-${String(this.siguiente).padStart(12, '0')}`;
    this.secretos.set(id, { tenantId: this.contexto.current().tenantId, tipo, valor: Uint8Array.from(valor), version: 1 });
    return Promise.resolve(id);
  }

  leer(secretoId: string): Promise<Uint8Array> {
    const secreto = this.secretos.get(secretoId);
    if (!secreto) throw new Error('secreto inexistente');
    return Promise.resolve(secreto.valor);
  }

  rotar(secretoId: string, valor: Uint8Array): Promise<void> {
    const secreto = this.secretos.get(secretoId);
    if (!secreto) throw new Error('secreto inexistente');
    this.secretos.set(secretoId, { ...secreto, valor: Uint8Array.from(valor), version: secreto.version + 1 });
    return Promise.resolve();
  }

  eliminar(secretoId: string): Promise<void> {
    this.secretos.delete(secretoId);
    return Promise.resolve();
  }

  instantanea(): () => void {
    const antes = new Map(this.secretos);
    return () => (this.secretos = antes);
  }

  texto(secretoId: string | null): string | undefined {
    const secreto = secretoId ? this.secretos.get(secretoId) : undefined;
    return secreto && new TextDecoder().decode(secreto.valor);
  }
}

/** Guarda copias, como la base: el agregado en memoria no es la fila. Filtra por el tenant del contexto. */
export class RepositorioEmisoresMemoria implements RepositorioEmisores, Transaccional {
  filas: Emisor[] = [];
  /** Para simular otra operación que guardó entre la lectura y la escritura. */
  antesDeActualizar: () => void = () => undefined;
  constructor(private readonly contexto: TenantContext) {}

  porEmpresa(empresaId: string): Promise<Emisor | null> {
    return Promise.resolve(this.copia(this.delTenant().find((emisor) => emisor.empresaId === empresaId)));
  }

  porId(emisorId: string): Promise<Emisor | null> {
    return Promise.resolve(this.copia(this.delTenant().find((emisor) => emisor.id === emisorId)));
  }

  insertar(emisor: Emisor): Promise<void> {
    if (this.delTenant().some((otro) => otro.empresaId === emisor.empresaId)) throw new VersionObsoletaEmisorError();
    this.filas.push(Emisor.reconstituir(emisor.datos));
    return Promise.resolve();
  }

  actualizar(emisor: Emisor, versionEsperada: number): Promise<void> {
    this.antesDeActualizar();
    const posicion = this.filas.findIndex((fila) => fila.id === emisor.id && fila.datos.tenantId === this.contexto.current().tenantId);
    if (posicion < 0 || this.filas[posicion].version !== versionEsperada) throw new VersionObsoletaEmisorError();
    this.filas[posicion] = Emisor.reconstituir(emisor.datos);
    return Promise.resolve();
  }

  instantanea(): () => void {
    const antes = this.filas.map((fila) => Emisor.reconstituir(fila.datos));
    return () => (this.filas = antes);
  }

  private delTenant(): Emisor[] {
    const tenantId = this.contexto.current().tenantId;
    return this.filas.filter((emisor) => emisor.datos.tenantId === tenantId);
  }

  private copia(emisor: Emisor | undefined): Emisor | null {
    return emisor ? Emisor.reconstituir(emisor.datos) : null;
  }
}

/** Sin domicilio fiscal ni ubigeo, como las empresas de dev: la prueba del spec 50 no los exige. */
function empresaEmisora(id: string, ruc: string, activa: boolean): EmpresaEmisora {
  return { id, ruc, activa, razonSocial: 'EMPRESA DE PRUEBA SAC', nombreComercial: null, domicilioFiscal: null, ubigeo: null };
}

export class EmpresasMemoria implements EmpresaEmisoraPort {
  readonly empresas = new Map<string, EmpresaEmisora & { tenantId: string }>([
    [EMPRESA, { ...empresaEmisora(EMPRESA, RUC_EMPRESA, true), tenantId: TENANT_A }],
    [EMPRESA_INACTIVA, { ...empresaEmisora(EMPRESA_INACTIVA, '20601234562', false), tenantId: TENANT_A }],
    [EMPRESA_DE_B, { ...empresaEmisora(EMPRESA_DE_B, '20512345678', true), tenantId: TENANT_B }],
  ]);
  constructor(private readonly contexto: TenantContext) {}

  obtener(empresaId: string): Promise<EmpresaEmisora> {
    const empresa = this.empresas.get(empresaId);
    if (!empresa || empresa.tenantId !== this.contexto.current().tenantId) throw new EmpresaNoEncontradaError();
    const { id, ruc, activa, razonSocial, nombreComercial, domicilioFiscal, ubigeo } = empresa;
    return Promise.resolve({ id, ruc, activa, razonSocial, nombreComercial, domicilioFiscal, ubigeo });
  }
}

export class ProveedoresMemoria implements ProveedoresFe {
  readonly proveedores = new Map<string, ProveedorFe>([
    [SIMULADO, { codigo: SIMULADO, requiereCertificado: true, seriePrueba: 'B999', dominiosPermitidos: ['simulador.invalid'], urlBeta: null, urlProduccion: null }],
    [SIN_CERTIFICADO, { codigo: SIN_CERTIFICADO, requiereCertificado: false, seriePrueba: 'B998', dominiosPermitidos: ['simulador.invalid'], urlBeta: null, urlProduccion: null }],
    [NUBEFACT, { codigo: NUBEFACT, requiereCertificado: false, seriePrueba: 'B001', dominiosPermitidos: ['api.nubefact.com'], urlBeta: null, urlProduccion: null }],
  ]);

  obtener(codigo: string): Promise<ProveedorFe> {
    const proveedor = this.proveedores.get(codigo);
    if (!proveedor) throw new ProveedorFeInvalidoError();
    return Promise.resolve(proveedor);
  }
}

export class AvisosMemoria implements RepositorioAvisosCertificado, Transaccional {
  avisos: AvisoCertificado[] = [];
  constructor(private readonly emisores: RepositorioEmisoresMemoria) {}

  registrar(aviso: AvisoCertificado): Promise<boolean> {
    if (this.avisos.some((otro) => otro.emisorId === aviso.emisorId && otro.huellaSha256 === aviso.huellaSha256)) return Promise.resolve(false);
    this.avisos.push({ ...aviso });
    return Promise.resolve(true);
  }

  /** Como fe.certificados_con_aviso_pendiente: todos los tenants, por id, sin los avisados por su huella. */
  pendientes(hasta: Date, despuesDe: string, limite: number): Promise<EmisorPendienteDeAviso[]> {
    const pendientes = this.emisores.filas
      .filter((emisor) => {
        const certificado = emisor.certificado;
        if (!certificado || certificado.venceEn.getTime() >= hasta.getTime() || emisor.id <= despuesDe) return false;
        return !this.avisos.some((aviso) => aviso.emisorId === emisor.id && aviso.huellaSha256 === certificado.huellaSha256);
      })
      .sort((uno, otro) => uno.id.localeCompare(otro.id))
      .slice(0, limite)
      .map((emisor) => ({ tenantId: emisor.datos.tenantId, emisorId: emisor.id }));
    return Promise.resolve(pendientes);
  }

  instantanea(): () => void {
    const antes = [...this.avisos];
    return () => (this.avisos = antes);
  }
}

export interface Dobles extends DependenciasEmisor {
  unidadDeTrabajo: UnidadDeTrabajoMemoria;
  contexto: ContextoFijo;
  reloj: RelojFijo;
  publicador: PublicadorMemoria;
  auditoria: AuditoriaMemoria;
  boveda: BovedaMemoria;
  emisores: RepositorioEmisoresMemoria;
  empresas: EmpresasMemoria;
  proveedores: ProveedoresMemoria;
}

export function crearDobles(): Dobles {
  const unidadDeTrabajo = new UnidadDeTrabajoMemoria();
  const contexto = new ContextoFijo({ tenantId: TENANT_A, actorId: USUARIO });
  const publicador = new PublicadorMemoria(unidadDeTrabajo);
  const auditoria = new AuditoriaMemoria();
  const boveda = new BovedaMemoria(contexto);
  const emisores = new RepositorioEmisoresMemoria(contexto);
  unidadDeTrabajo.participar(publicador, auditoria, boveda, emisores);
  return {
    unidadDeTrabajo,
    contexto,
    reloj: new RelojFijo(),
    ids: new IdsEnOrden(),
    publicador,
    auditoria,
    boveda,
    emisores,
    empresas: new EmpresasMemoria(contexto),
    proveedores: new ProveedoresMemoria(),
    lector: new LectorCertificadoForge(),
    entorno: { produccionPermitida: true, simuladoPermitido: true },
  };
}

export interface DoblesAvisos extends DependenciasAvisos {
  avisos: AvisosMemoria;
  diasPorTenant: Map<string, number>;
  registros: { nivel: 'informar' | 'avisar'; mensaje: string; datos: Record<string, unknown> }[];
}

/** Sobre los mismos emisores que los casos de uso del API, como el worker sobre la misma base. */
export function crearDoblesAvisos(dobles: Dobles): DoblesAvisos {
  const avisos = new AvisosMemoria(dobles.emisores);
  dobles.unidadDeTrabajo.participar(avisos);
  const diasPorTenant = new Map<string, number>();
  const registros: DoblesAvisos['registros'] = [];
  return {
    unidadDeTrabajo: dobles.unidadDeTrabajo,
    contexto: dobles.contexto,
    reloj: dobles.reloj,
    ids: dobles.ids,
    publicador: dobles.publicador,
    emisores: dobles.emisores,
    avisos,
    diasAviso: { delTenant: () => Promise.resolve(diasPorTenant.get(dobles.contexto.current().tenantId) ?? 30) },
    diasPorTenant,
    registros,
    informar: (mensaje, datos) => registros.push({ nivel: 'informar', mensaje, datos }),
    avisar: (mensaje, datos) => registros.push({ nivel: 'avisar', mensaje, datos }),
  };
}
