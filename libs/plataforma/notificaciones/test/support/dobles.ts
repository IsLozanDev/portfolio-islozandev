import type { AuditoriaPort, EntradaAuditoria } from '@vitrina/plataforma/auditoria';
import type { Clock, DomainEvent, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { ConsentimientoPort, PersonaDetalle, PersonaPort } from '@vitrina/plataforma/personas';
import type {
  DependenciasEntrega,
  DependenciasEnvio,
  DependenciasPlantillas,
  DependenciasPreferencias,
  DependenciasWebhook,
  Registrar,
} from '../../src/application/dependencias.js';
import type { ColaEnvios, TrabajoEnvio } from '../../src/application/ports/cola-envios.js';
import type { CorreoSaliente, ProveedorCorreo } from '../../src/application/ports/proveedor-correo.js';
import type {
  FiltroPlantillas,
  LocalizadorMensajes,
  Pagina,
  RepositorioBajas,
  RepositorioContactosInvalidos,
  RepositorioMensajes,
  RepositorioPlantillas,
  ResumenPlantilla,
} from '../../src/application/ports/repositorios.js';
import type { EventoProveedor, VerificadorWebhook } from '../../src/application/ports/verificador-webhook.js';
import type { Baja } from '../../src/domain/baja.js';
import { CANAL_CORREO, type CanalNotificacion } from '../../src/domain/canal.js';
import { MensajeModificadoError, VersionObsoletaPlantillaError } from '../../src/domain/errores.js';
import type { IntentoEntrega } from '../../src/domain/intento-entrega.js';
import { Mensaje } from '../../src/domain/mensaje.js';
import { IDIOMA_POR_DEFECTO, origenDe, type Plantilla } from '../../src/domain/plantilla.js';
import { FirmadorEnlaceHmac } from '../../src/infrastructure/crypto/firmador-enlace.hmac.js';
import { SaneadorHtmlSanitize } from '../../src/infrastructure/sanitize-html/saneador-html.sanitize.js';

export const TENANT_A = '42000000-0000-7000-8000-00000000000a';
export const TENANT_B = '42000000-0000-7000-8000-00000000000b';
/** 15:00 UTC = 10:00 de Lima: dentro de la ventana de promocionales. */
export const AHORA = new Date('2026-11-20T15:00:00.000Z');
export const CLAVE_ENLACE_PRUEBA = 'clave-de-enlace-de-prueba-de-32-caracteres';
export const URL_PREFERENCIAS_PRUEBA = 'https://admin.vitrina.test';

export const PLANTILLA_PRUEBA: Plantilla = {
  id: '42000000-0000-0000-0000-000000000001',
  tenantId: null,
  codigo: 'PRUEBA_CORREO',
  nombre: 'Correo de prueba',
  canal: 'CORREO',
  idioma: 'es',
  version: 1,
  asunto: 'Prueba de correo de {{producto}}',
  cuerpo: '<p>Hola {{nombre}}:</p><p>Prueba de {{producto}}.</p>',
  variables: [
    { nombre: 'nombre', tipo: 'texto', ejemplo: 'María Quispe' },
    { nombre: 'producto', tipo: 'texto', ejemplo: 'SazónPOS' },
  ],
  plantillaBaseId: null,
  activa: true,
  personalizable: true,
  creadoPor: null,
  creadoEn: new Date('2026-11-01T00:00:00.000Z'),
};

export class RelojFijo implements Clock {
  constructor(public instante: Date = AHORA) {}

  now(): Date {
    return new Date(this.instante);
  }

  avanzar(milisegundos: number): void {
    this.instante = new Date(this.instante.getTime() + milisegundos);
  }
}

/** Sin base: corre el trabajo. La reversión se prueba en la integración. */
export const UNIDAD_DE_TRABAJO: UnitOfWork = { run: (trabajo) => trabajo() };

export class IdsSecuenciales {
  next(): string {
    return uuidV7();
  }
}

export class PublicadorMemoria implements EventPublisher {
  readonly eventos: DomainEvent[] = [];

  async publish(evento: DomainEvent): Promise<void> {
    this.eventos.push(evento);
  }
}

/** Base y personalizadas de todos los tenants; cada lectura filtra por el tenant del contexto, como la RLS. */
export class PlantillasMemoria implements RepositorioPlantillas {
  plantillas: Plantilla[] = [PLANTILLA_PRUEBA];

  constructor(private readonly contexto: TenantContext) {}

  async vigente(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    return (await this.vigenteDelTenant(codigo, canal, idioma)) ?? this.base(codigo, canal, idioma);
  }

  async basePersonalizable(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    const base = await this.base(codigo, canal, idioma);
    return base?.personalizable ? base : null;
  }

  async vigenteDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    return this.mayor(this.delTenant(codigo, canal, idioma).filter((plantilla) => plantilla.activa));
  }

  async mayorVersionDelTenant(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number> {
    return this.mayor(this.delTenant(codigo, canal, idioma))?.version ?? 0;
  }

  async listar(filtro: FiltroPlantillas): Promise<Pagina<ResumenPlantilla>> {
    const bases = this.plantillas.filter((plantilla) => plantilla.tenantId === null && plantilla.personalizable);
    const codigos = [...new Set(bases.map((plantilla) => plantilla.codigo))].sort();
    const vigentes: Plantilla[] = [];
    for (const codigo of codigos) {
      const vigente = await this.vigente(codigo, CANAL_CORREO, IDIOMA_POR_DEFECTO);
      if (vigente) vigentes.push(vigente);
    }
    const texto = filtro.texto?.toLowerCase();
    const filtradas = vigentes.filter(
      (plantilla) => !texto || [plantilla.nombre, plantilla.codigo, plantilla.asunto ?? ''].some((campo) => campo.toLowerCase().includes(texto)),
    );
    const desde = (filtro.pagina - 1) * filtro.tamano;
    const items = filtradas.slice(desde, desde + filtro.tamano).map(resumenDe);
    return { items, total: filtradas.length, pagina: filtro.pagina, tamano: filtro.tamano };
  }

  async versiones(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla[]> {
    return this.delTenant(codigo, canal, idioma).sort((una, otra) => otra.version - una.version);
  }

  async guardarVersion(nueva: Plantilla, versionEsperada: number | null): Promise<void> {
    const vigente = await this.vigenteDelTenant(nueva.codigo, nueva.canal, nueva.idioma);
    if ((vigente?.version ?? null) !== versionEsperada) throw new VersionObsoletaPlantillaError();
    if (vigente) this.reemplazar({ ...vigente, activa: false });
    this.plantillas.push(nueva);
  }

  async desactivarPersonalizacion(codigo: string, canal: CanalNotificacion, idioma: string): Promise<number> {
    const activas = this.delTenant(codigo, canal, idioma).filter((plantilla) => plantilla.activa);
    for (const activa of activas) this.reemplazar({ ...activa, activa: false });
    return activas.length;
  }

  private async base(codigo: string, canal: CanalNotificacion, idioma: string): Promise<Plantilla | null> {
    return this.mayor(this.delCodigo(codigo, canal, idioma).filter((plantilla) => plantilla.tenantId === null && plantilla.activa));
  }

  private delCodigo(codigo: string, canal: CanalNotificacion, idioma: string): Plantilla[] {
    return this.plantillas.filter((plantilla) => plantilla.codigo === codigo && plantilla.canal === canal && plantilla.idioma === idioma);
  }

  private delTenant(codigo: string, canal: CanalNotificacion, idioma: string): Plantilla[] {
    const { tenantId } = this.contexto.current();
    return this.delCodigo(codigo, canal, idioma).filter((plantilla) => plantilla.tenantId === tenantId);
  }

  private mayor(plantillas: Plantilla[]): Plantilla | null {
    return plantillas.reduce<Plantilla | null>((mayor, plantilla) => (!mayor || plantilla.version > mayor.version ? plantilla : mayor), null);
  }

  private reemplazar(cambiada: Plantilla): void {
    this.plantillas = this.plantillas.map((plantilla) => (plantilla.id === cambiada.id ? cambiada : plantilla));
  }
}

/** Un mapa por id; la clave y el tenant se filtran como en la base. */
export class MensajesMemoria implements RepositorioMensajes {
  readonly filas = new Map<string, Mensaje>();
  readonly intentos: IntentoEntrega[] = [];

  constructor(private readonly contexto: TenantContext) {}

  async porClave(claveIdempotencia: string): Promise<Mensaje | null> {
    const fila = [...this.filas.values()].find((mensaje) => {
      const datos = mensaje.instantanea();
      return datos.claveIdempotencia === claveIdempotencia && datos.tenantId === this.tenantId;
    });
    return fila ? Mensaje.reconstituir(fila.instantanea()) : null;
  }

  async obtener(mensajeId: string): Promise<Mensaje | null> {
    const fila = this.filas.get(mensajeId);
    if (!fila || fila.instantanea().tenantId !== this.tenantId) return null;
    return Mensaje.reconstituir(fila.instantanea());
  }

  async insertar(mensaje: Mensaje): Promise<Mensaje> {
    const existente = await this.porClave(mensaje.instantanea().claveIdempotencia);
    if (existente) return existente;
    this.filas.set(mensaje.id, Mensaje.reconstituir(mensaje.instantanea()));
    return mensaje;
  }

  async actualizar(mensaje: Mensaje, versionEsperada: number): Promise<void> {
    const actual = this.filas.get(mensaje.id);
    if (!actual || actual.version !== versionEsperada) throw new MensajeModificadoError();
    this.filas.set(mensaje.id, Mensaje.reconstituir({ ...mensaje.instantanea(), version: versionEsperada + 1 }));
  }

  async registrarIntento(intento: IntentoEntrega): Promise<void> {
    this.intentos.push(intento);
  }

  async siguienteNumeroIntento(mensajeId: string): Promise<number> {
    return this.intentos.filter((intento) => intento.mensajeId === mensajeId).length + 1;
  }

  /** El orden de inserción hace de `creado_en`. */
  async ultimoDestino(destinoHash: string): Promise<string | null> {
    const delDestino = [...this.filas.values()]
      .map((mensaje) => mensaje.instantanea())
      .filter((datos) => datos.tenantId === this.tenantId && datos.destinoHash === destinoHash);
    return delDestino.at(-1)?.destino ?? null;
  }

  guardado(mensajeId: string): Mensaje {
    const fila = this.filas.get(mensajeId);
    if (!fila) throw new Error(`Sin mensaje ${mensajeId}`);
    return fila;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

export class ContactosInvalidosMemoria implements RepositorioContactosInvalidos {
  readonly marcados = new Map<string, string>();

  constructor(private readonly contexto: TenantContext) {}

  async esInvalido(canal: CanalNotificacion, destinoHash: string): Promise<boolean> {
    return this.marcados.has(this.clave(canal, destinoHash));
  }

  async marcar(canal: CanalNotificacion, destinoHash: string, motivo: string): Promise<void> {
    const clave = this.clave(canal, destinoHash);
    if (!this.marcados.has(clave)) this.marcados.set(clave, motivo);
  }

  private clave(canal: string, destinoHash: string): string {
    return `${this.contexto.current().tenantId}|${canal}|${destinoHash}`;
  }
}

/** Bajas de todos los tenants; cada lectura filtra por el tenant del contexto, como la RLS. */
export class BajasMemoria implements RepositorioBajas {
  readonly bajas: Baja[] = [];

  constructor(private readonly contexto: TenantContext) {}

  async delDestino(canal: CanalNotificacion, destinoHash: string): Promise<Baja[]> {
    return this.bajas.filter((baja) => {
      const datos = baja.instantanea();
      return datos.tenantId === this.tenantId && datos.canal === canal && datos.destinoHash === destinoHash;
    });
  }

  async registrar(baja: Baja): Promise<Baja> {
    const datos = baja.instantanea();
    const existente = (await this.delDestino(datos.canal, datos.destinoHash)).find((guardada) => guardada.alcance === datos.alcance);
    if (existente) return existente;
    this.bajas.push(baja);
    return baja;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}

/** Personas con sus correos. */
export class PersonasMemoria implements Pick<PersonaPort, 'obtener'> {
  readonly correos = new Map<string, { valor: string; principal: boolean }[]>();

  async obtener(personaId: string): Promise<PersonaDetalle> {
    const correos = this.correos.get(personaId) ?? [];
    return {
      id: personaId,
      contactos: [
        { id: uuidV7(), tipo: 'CELULAR', valor: '987654321', principal: true },
        ...correos.map((correo) => ({ id: uuidV7(), tipo: 'CORREO' as const, ...correo })),
      ],
    } as PersonaDetalle;
  }
}

export class ConsentimientosMemoria implements Pick<ConsentimientoPort, 'vigente' | 'revocar'> {
  readonly conPromociones = new Set<string>();
  readonly consultas: string[] = [];
  readonly revocaciones: { personaId: string; finalidad: string; canal: string; actorId: string | undefined }[] = [];

  /** Con contexto, cada revocación guarda el actor, como `exigirUsuario` de PER. */
  constructor(private readonly contexto?: TenantContext) {}

  async revocar(personaId: string, finalidad: string, canal: string): ReturnType<ConsentimientoPort['revocar']> {
    this.revocaciones.push({ personaId, finalidad, canal, actorId: this.contexto?.current().actorId });
    this.conPromociones.delete(personaId);
    return {} as Awaited<ReturnType<ConsentimientoPort['revocar']>>;
  }

  async vigente(personaId: string, finalidad: string): ReturnType<ConsentimientoPort['vigente']> {
    this.consultas.push(finalidad);
    if (finalidad !== 'PROMOCIONES' || !this.conPromociones.has(personaId)) return null;
    return { finalidad: 'PROMOCIONES', versionTexto: '1', canal: 'WEB', otorgadoEn: AHORA };
  }
}

export class ColaMemoria implements ColaEnvios {
  readonly trabajos = new Map<string, { trabajo: TrabajoEnvio; retardoMs: number }>();

  async encolar(trabajo: TrabajoEnvio, retardoMs: number): Promise<void> {
    if (!this.trabajos.has(trabajo.mensajeId)) this.trabajos.set(trabajo.mensajeId, { trabajo, retardoMs });
  }
}

/** Responde lo que se le programa, en orden; sin programación acepta. */
export class ProveedorFalso implements ProveedorCorreo {
  readonly enviados: CorreoSaliente[] = [];
  private readonly respuestas: (Error | string)[] = [];

  responder(...respuestas: (Error | string)[]): void {
    this.respuestas.push(...respuestas);
  }

  async enviar(correo: CorreoSaliente): Promise<{ idExterno: string }> {
    this.enviados.push(correo);
    const respuesta = this.respuestas.shift() ?? `re_${correo.mensajeId}`;
    if (respuesta instanceof Error) throw respuesta;
    return { idExterno: respuesta };
  }
}

export class VerificadorFalso implements VerificadorWebhook {
  constructor(public evento: EventoProveedor) {}

  verificar(): EventoProveedor {
    return this.evento;
  }
}

export class LocalizadorMemoria implements LocalizadorMensajes {
  constructor(private readonly mensajes: MensajesMemoria) {}

  async porIdExterno(idExterno: string): Promise<{ mensajeId: string; tenantId: string } | null> {
    const fila = [...this.mensajes.filas.values()].find((mensaje) => mensaje.instantanea().idExterno === idExterno);
    return fila ? { mensajeId: fila.id, tenantId: fila.instantanea().tenantId } : null;
  }
}

function resumenDe(plantilla: Plantilla): ResumenPlantilla {
  const { codigo, nombre, canal, idioma, version, asunto } = plantilla;
  return { codigo, nombre, canal, idioma, origen: origenDe(plantilla), version, asunto, actualizadoEn: plantilla.creadoEn };
}

export class AuditoriaMemoria implements Pick<AuditoriaPort, 'registrar'> {
  readonly entradas: EntradaAuditoria[] = [];

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    this.entradas.push(entrada);
  }
}

export function registro(): Registrar & { llamadas: { mensaje: string; datos: Record<string, unknown> }[] } {
  const llamadas: { mensaje: string; datos: Record<string, unknown> }[] = [];
  const registrar = ((mensaje: string, datos: Record<string, unknown>) => {
    llamadas.push({ mensaje, datos });
  }) as Registrar & { llamadas: typeof llamadas };
  registrar.llamadas = llamadas;
  return registrar;
}

/** Todas las piezas en memoria, compartidas por envío, entrega y webhook. */
export function escenario() {
  const contexto = new AlsTenantContext();
  const reloj = new RelojFijo();
  const mensajes = new MensajesMemoria(contexto);
  const contactosInvalidos = new ContactosInvalidosMemoria(contexto);
  const bajas = new BajasMemoria(contexto);
  const firmador = new FirmadorEnlaceHmac(CLAVE_ENLACE_PRUEBA);
  const publicador = new PublicadorMemoria();
  const personas = new PersonasMemoria();
  const consentimientos = new ConsentimientosMemoria(contexto);
  const proveedor = new ProveedorFalso();
  const avisos = registro();
  const plantillas = new PlantillasMemoria(contexto);
  const auditoria = new AuditoriaMemoria();
  const comun = { unidadDeTrabajo: UNIDAD_DE_TRABAJO, contexto, reloj, ids: new IdsSecuenciales(), mensajes };
  const envio: DependenciasEnvio = {
    ...comun,
    publicador,
    plantillas,
    contactosInvalidos,
    bajas,
    enlacePreferencias: { firmador, urlBase: URL_PREFERENCIAS_PRUEBA },
    avisar: avisos,
    personas,
    consentimientos,
    hashearDestino: (destino) => `sha256:${destino}`,
    zonaHoraria: 'America/Lima',
  };
  const entrega: DependenciasEntrega = { ...comun, proveedor, remitente: 'Vitrina <no-responder@vitrina.pe>', avisar: avisos };
  const verificador = new VerificadorFalso({ tipo: 'IGNORADO' });
  const webhook: DependenciasWebhook = { ...comun, verificador, localizador: new LocalizadorMemoria(mensajes), contactosInvalidos, avisar: avisos };
  const informes = registro();
  const preferencias: DependenciasPreferencias = { ...comun, bajas, consentimientos, firmador, informar: informes };
  const gestionPlantillas: DependenciasPlantillas = { ...comun, plantillas, saneador: new SaneadorHtmlSanitize(), auditoria };
  const enTenant = <T>(tenantId: string, trabajo: () => Promise<T>, actorId?: string) => contexto.run({ tenantId, actorId }, trabajo);
  return {
    contexto,
    reloj,
    mensajes,
    contactosInvalidos,
    bajas,
    firmador,
    publicador,
    personas,
    consentimientos,
    proveedor,
    verificador,
    avisos,
    plantillas,
    auditoria,
    envio,
    entrega,
    webhook,
    gestionPlantillas,
    preferencias,
    informes,
    enTenant,
  };
}
