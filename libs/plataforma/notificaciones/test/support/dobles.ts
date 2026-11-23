import type { Clock, DomainEvent, EventPublisher, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { ConsentimientoPort, PersonaDetalle, PersonaPort } from '@vitrina/plataforma/personas';
import type { DependenciasEntrega, DependenciasEnvio, DependenciasWebhook, Registrar } from '../../src/application/dependencias.js';
import type { ColaEnvios, TrabajoEnvio } from '../../src/application/ports/cola-envios.js';
import type { CorreoSaliente, ProveedorCorreo } from '../../src/application/ports/proveedor-correo.js';
import type {
  LocalizadorMensajes,
  RepositorioContactosInvalidos,
  RepositorioMensajes,
  RepositorioPlantillas,
} from '../../src/application/ports/repositorios.js';
import type { EventoProveedor, VerificadorWebhook } from '../../src/application/ports/verificador-webhook.js';
import type { CanalNotificacion } from '../../src/domain/canal.js';
import { MensajeModificadoError } from '../../src/domain/errores.js';
import type { IntentoEntrega } from '../../src/domain/intento-entrega.js';
import { Mensaje } from '../../src/domain/mensaje.js';
import type { Plantilla } from '../../src/domain/plantilla.js';

export const TENANT_A = '42000000-0000-7000-8000-00000000000a';
export const TENANT_B = '42000000-0000-7000-8000-00000000000b';
/** 15:00 UTC = 10:00 de Lima: dentro de la ventana de promocionales. */
export const AHORA = new Date('2026-11-20T15:00:00.000Z');

export const PLANTILLA_PRUEBA: Plantilla = {
  id: '42000000-0000-0000-0000-000000000001',
  tenantId: null,
  codigo: 'PRUEBA_CORREO',
  canal: 'CORREO',
  version: 1,
  asunto: 'Prueba de correo de {{producto}}',
  cuerpo: '<p>Hola {{nombre}}:</p><p>Prueba de {{producto}}.</p>',
  variables: [
    { nombre: 'nombre', tipo: 'texto' },
    { nombre: 'producto', tipo: 'texto' },
  ],
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

export class PlantillasMemoria implements RepositorioPlantillas {
  plantillas: Plantilla[] = [PLANTILLA_PRUEBA];

  async vigente(codigo: string, canal: CanalNotificacion): Promise<Plantilla | null> {
    return this.plantillas.find((plantilla) => plantilla.codigo === codigo && plantilla.canal === canal) ?? null;
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

export class ConsentimientosMemoria implements Pick<ConsentimientoPort, 'vigente'> {
  readonly conPromociones = new Set<string>();
  readonly consultas: string[] = [];

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

export function registro(): Registrar & { llamadas: { mensaje: string; datos: Record<string, unknown> }[] } {
  const llamadas: { mensaje: string; datos: Record<string, unknown> }[] = [];
  const registrar = ((mensaje: string, datos: Record<string, unknown>) => llamadas.push({ mensaje, datos })) as Registrar & { llamadas: typeof llamadas };
  registrar.llamadas = llamadas;
  return registrar;
}

/** Todas las piezas en memoria, compartidas por envío, entrega y webhook. */
export function escenario() {
  const contexto = new AlsTenantContext();
  const reloj = new RelojFijo();
  const mensajes = new MensajesMemoria(contexto);
  const contactosInvalidos = new ContactosInvalidosMemoria(contexto);
  const publicador = new PublicadorMemoria();
  const personas = new PersonasMemoria();
  const consentimientos = new ConsentimientosMemoria();
  const proveedor = new ProveedorFalso();
  const avisos = registro();
  const comun = { unidadDeTrabajo: UNIDAD_DE_TRABAJO, contexto, reloj, ids: new IdsSecuenciales(), mensajes };
  const envio: DependenciasEnvio = {
    ...comun,
    publicador,
    plantillas: new PlantillasMemoria(),
    contactosInvalidos,
    personas,
    consentimientos,
    hashearDestino: (destino) => `sha256:${destino}`,
    zonaHoraria: 'America/Lima',
  };
  const entrega: DependenciasEntrega = { ...comun, proveedor, remitente: 'Vitrina <no-responder@vitrina.pe>', avisar: avisos };
  const verificador = new VerificadorFalso({ tipo: 'IGNORADO' });
  const webhook: DependenciasWebhook = { ...comun, verificador, localizador: new LocalizadorMemoria(mensajes), contactosInvalidos, avisar: avisos };
  const enTenant = <T>(tenantId: string, trabajo: () => Promise<T>) => contexto.run({ tenantId }, trabajo);
  return { contexto, reloj, mensajes, contactosInvalidos, publicador, personas, consentimientos, proveedor, verificador, avisos, envio, entrega, webhook, enTenant };
}
