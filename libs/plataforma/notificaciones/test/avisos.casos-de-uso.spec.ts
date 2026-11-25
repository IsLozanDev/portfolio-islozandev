import type { EventoEntregado } from '@vitrina/plataforma/eventos';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { PropietarioTenant } from '@vitrina/plataforma/seguridad';
import { AvisarIntegridadRota } from '../src/application/avisos/avisar-integridad-rota.js';
import { AvisarSoporteSolicitado } from '../src/application/avisos/avisar-soporte-solicitado.js';
import { AvisarSuscripcionPorVencer } from '../src/application/avisos/avisar-suscripcion-por-vencer.js';
import { AvisarTenantSuspendido } from '../src/application/avisos/avisar-tenant-suspendido.js';
import { EVENTO_AVISO_REGISTRADO, EVENTO_AVISO_SIN_DESTINATARIOS, EnvioAvisos } from '../src/application/avisos/envio-avisos.js';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import { CODIGOS_AVISO } from '../src/domain/avisos-plataforma.js';
import { AvisosPlataformaConsumidor } from '../src/interface/avisos-plataforma.consumidor.js';
import { escenario, registro, TENANT_A, TENANT_B, UNIDAD_DE_TRABAJO } from './support/dobles.js';
import { plantillasDeLaSemilla } from './support/plantillas-avisos.js';

const CORREO_OPERACION = 'operacion@vitrina.pe';
const NOMBRE_TENANT_A = 'Restaurante El Buen Sabor';
const ANA = { usuarioId: '44000000-0000-7000-8000-0000000000f1', correo: 'ana@buensabor.pe' };
const LUIS = { usuarioId: '44000000-0000-7000-8000-0000000000f2', correo: 'luis@buensabor.pe' };
const PEDRO = { usuarioId: '44000000-0000-7000-8000-0000000000f3', correo: 'pedro@otro.pe' };

/** Propietarios por tenant; responde con los del tenant del contexto, como la consulta real. */
class PropietariosMemoria {
  readonly porTenant = new Map<string, PropietarioTenant[]>([
    [TENANT_A, [ANA, LUIS]],
    [TENANT_B, [PEDRO]],
  ]);

  constructor(private readonly tenantActual: () => string) {}

  async listar(): Promise<PropietarioTenant[]> {
    return this.porTenant.get(this.tenantActual()) ?? [];
  }
}

function evento(eventType: string, payload: unknown, tenantId = TENANT_A, eventId = uuidV7()): EventoEntregado {
  return { eventId, tenantId, eventType, payload } as EventoEntregado;
}

const POR_VENCER = { producto_codigo: 'REST', vigente_hasta: '2026-11-27', dias_antes: 3 };
const SUSPENDIDO = { estado_anterior: 'ACTIVO', motivo: 'Fin del periodo de gracia', fecha_efectiva: '2026-11-24T15:00:00.000Z' };
const SOPORTE = { acceso_id: uuidV7(), tenant_id: TENANT_A, agente_id: uuidV7(), ticket: 'SOP-1024', modo: 'LECTURA', horas_solicitadas: 4 };
const INTEGRIDAD = { numero_roto: '1532', motivo: 'HASH', modo: 'INCREMENTAL', desde_numero: '1' };

describe('avisos de plataforma (spec 44)', () => {
  let piezas: ReturnType<typeof escenario>;
  let propietarios: PropietariosMemoria;
  let informes: ReturnType<typeof registro>;
  let consumidor: AvisosPlataformaConsumidor;
  let correoOperacion: string | undefined;

  function crearConsumidor(): AvisosPlataformaConsumidor {
    const envio = new EnvioAvisos({
      unidadDeTrabajo: UNIDAD_DE_TRABAJO,
      contexto: piezas.contexto,
      notificaciones: new EnviarNotificacion(piezas.envio),
      propietarios,
      nombreTenant: { obtener: async () => (piezas.contexto.current().tenantId === TENANT_A ? NOMBRE_TENANT_A : null) },
      correoOperacion,
      zonaHoraria: 'America/Lima',
      informar: informes,
      avisar: piezas.avisos,
    });
    return new AvisosPlataformaConsumidor({
      suscripcionPorVencer: new AvisarSuscripcionPorVencer(envio),
      tenantSuspendido: new AvisarTenantSuspendido(envio),
      soporteSolicitado: new AvisarSoporteSolicitado(envio),
      integridadRota: new AvisarIntegridadRota(envio),
    });
  }

  /** Como el relay: el contexto lleva el tenant del evento. */
  const entregar = (manejar: (entregado: EventoEntregado) => Promise<void>, entregado: EventoEntregado) =>
    piezas.enTenant(entregado.tenantId, () => manejar(entregado));

  const mensajes = () => [...piezas.mensajes.filas.values()].map((mensaje) => mensaje.instantanea());

  beforeEach(async () => {
    piezas = escenario();
    piezas.plantillas.plantillas.push(...(await plantillasDeLaSemilla()));
    propietarios = new PropietariosMemoria(() => piezas.contexto.current().tenantId);
    informes = registro();
    correoOperacion = CORREO_OPERACION;
    consumidor = crearConsumidor();
  });

  it('suscripcion.por_vencer con dias_antes = 3 y dos propietarios: dos mensajes ENCOLADO con su plantilla y variables', async () => {
    await entregar((entregado) => consumidor.suscripcionPorVencer(entregado), evento('suscripcion.por_vencer', POR_VENCER));

    const guardados = mensajes();
    expect(guardados.map((mensaje) => mensaje.destino).sort()).toEqual([ANA.correo, LUIS.correo]);
    for (const mensaje of guardados) {
      expect(mensaje).toMatchObject({ tenantId: TENANT_A, estado: 'ENCOLADO', finalidad: 'TRANSACCIONAL', plantillaId: '44000000-0000-0000-0000-000000000001' });
      expect(mensaje.asunto).toBe('Tu suscripción a REST vence en 3 días');
      expect(mensaje.cuerpo).toContain('vence el 27/11/2026, dentro de 3 días');
      expect(mensaje.cuerpo).toContain(NOMBRE_TENANT_A);
    }
    expect(piezas.publicador.eventos).toHaveLength(2);
  });

  it('tenant.suspendido y soporte.solicitado: un mensaje por propietario con su plantilla y variables', async () => {
    await entregar((entregado) => consumidor.tenantSuspendido(entregado), evento('tenant.suspendido', SUSPENDIDO));
    await entregar((entregado) => consumidor.soporteSolicitado(entregado), evento('soporte.solicitado', SOPORTE));

    const porPlantilla = (plantillaId: string) => mensajes().filter((mensaje) => mensaje.plantillaId === plantillaId);
    const suspendidos = porPlantilla('44000000-0000-0000-0000-000000000002');
    expect(suspendidos.map((mensaje) => mensaje.destino).sort()).toEqual([ANA.correo, LUIS.correo]);
    expect(suspendidos[0].asunto).toBe(`La cuenta de ${NOMBRE_TENANT_A} fue suspendida`);
    expect(suspendidos[0].cuerpo).toContain('suspendida desde el 24/11/2026');
    expect(suspendidos[0].cuerpo).toContain('Motivo: Fin del periodo de gracia.');

    const soportes = porPlantilla('44000000-0000-0000-0000-000000000003');
    expect(soportes.map((mensaje) => mensaje.destino).sort()).toEqual([ANA.correo, LUIS.correo]);
    expect(soportes[0].asunto).toBe(`Soporte pide acceso a ${NOMBRE_TENANT_A} (ticket SOP-1024)`);
    expect(soportes[0].cuerpo).toContain('Modo: LECTURA. Horas solicitadas: 4.');
  });

  it('aud.integridad.rota: un mensaje a NOT_CORREO_OPERACION con el tenant del evento; ningún propietario lo recibe', async () => {
    await entregar((entregado) => consumidor.integridadRota(entregado), evento('aud.integridad.rota', INTEGRIDAD));

    expect(mensajes()).toEqual([
      expect.objectContaining({ tenantId: TENANT_A, destino: CORREO_OPERACION, plantillaId: '44000000-0000-0000-0000-000000000004', estado: 'ENCOLADO' }),
    ]);
    expect(mensajes()[0].cuerpo).toContain(`Tenant: ${TENANT_A}. Número roto: 1532. Motivo: HASH.`);
  });

  it('aud.integridad.rota sin NOT_CORREO_OPERACION: advertencia y ningún mensaje', async () => {
    correoOperacion = undefined;
    consumidor = crearConsumidor();
    const entregado = evento('aud.integridad.rota', INTEGRIDAD);

    await expect(entregar((recibido) => consumidor.integridadRota(recibido), entregado)).resolves.toBeUndefined();

    expect(mensajes()).toEqual([]);
    expect(piezas.avisos.llamadas).toEqual([
      { mensaje: EVENTO_AVISO_SIN_DESTINATARIOS, datos: { event_id: entregado.eventId, tenant_id: TENANT_A, plantilla: CODIGOS_AVISO.integridadRota, motivo: 'SIN_NOT_CORREO_OPERACION' } },
    ]);
  });

  it('TR-RNF-008: el mismo evento entregado dos veces no crea mensajes nuevos', async () => {
    const entregado = evento('suscripcion.por_vencer', POR_VENCER);
    await entregar((recibido) => consumidor.suscripcionPorVencer(recibido), entregado);
    await entregar((recibido) => consumidor.suscripcionPorVencer(recibido), entregado);

    expect(mensajes()).toHaveLength(2);
    expect(piezas.publicador.eventos).toHaveLength(2);
    expect(informes.llamadas.at(-1)?.datos).toMatchObject({ destinatarios: 2, repetidos: 2 });
  });

  it('un reintento a mitad de la lista solo registra al propietario que faltaba', async () => {
    const entregado = evento('tenant.suspendido', SUSPENDIDO);
    propietarios.porTenant.set(TENANT_A, [ANA]);
    await entregar((recibido) => consumidor.tenantSuspendido(recibido), entregado);
    propietarios.porTenant.set(TENANT_A, [ANA, LUIS]);
    await entregar((recibido) => consumidor.tenantSuspendido(recibido), entregado);

    expect(mensajes().map((mensaje) => mensaje.destino).sort()).toEqual([ANA.correo, LUIS.correo]);
  });

  it('tenant sin propietarios activos: advertencia, el evento se consume sin error', async () => {
    propietarios.porTenant.set(TENANT_A, []);
    const entregado = evento('soporte.solicitado', SOPORTE);

    await expect(entregar((recibido) => consumidor.soporteSolicitado(recibido), entregado)).resolves.toBeUndefined();

    expect(mensajes()).toEqual([]);
    expect(piezas.avisos.llamadas).toEqual([
      { mensaje: EVENTO_AVISO_SIN_DESTINATARIOS, datos: { event_id: entregado.eventId, tenant_id: TENANT_A, plantilla: CODIGOS_AVISO.soporteSolicitado, motivo: 'SIN_PROPIETARIOS_ACTIVOS' } },
    ]);
  });

  it('TR-RNF-010: solo los propietarios del tenant del evento; sin nombre en ORG se usa el id del tenant', async () => {
    await entregar((recibido) => consumidor.suscripcionPorVencer(recibido), evento('suscripcion.por_vencer', POR_VENCER, TENANT_B));

    expect(mensajes()).toEqual([expect.objectContaining({ tenantId: TENANT_B, destino: PEDRO.correo })]);
    expect(mensajes()[0].cuerpo).toContain(TENANT_B);
  });

  it('la personalización del tenant de una de las plantillas se usa en el siguiente aviso de ese tenant', async () => {
    const [base] = (await plantillasDeLaSemilla()).filter((plantilla) => plantilla.codigo === CODIGOS_AVISO.tenantSuspendido);
    piezas.plantillas.plantillas.push({
      ...base,
      id: uuidV7(),
      tenantId: TENANT_A,
      asunto: 'Aviso de {{tenant}}: cuenta suspendida',
      plantillaBaseId: base.id,
      creadoPor: uuidV7(),
    });

    await entregar((recibido) => consumidor.tenantSuspendido(recibido), evento('tenant.suspendido', SUSPENDIDO));
    await entregar((recibido) => consumidor.tenantSuspendido(recibido), evento('tenant.suspendido', SUSPENDIDO, TENANT_B));

    const asuntoDe = (tenantId: string) => mensajes().find((mensaje) => mensaje.tenantId === tenantId)?.asunto;
    expect(asuntoDe(TENANT_A)).toBe(`Aviso de ${NOMBRE_TENANT_A}: cuenta suspendida`);
    expect(asuntoDe(TENANT_B)).toBe(`La cuenta de ${TENANT_B} fue suspendida`);
  });

  it('TR-RNF-026: los logs llevan cantidades y estados, nunca correos', async () => {
    await entregar((recibido) => consumidor.suscripcionPorVencer(recibido), evento('suscripcion.por_vencer', POR_VENCER));
    await entregar((recibido) => consumidor.integridadRota(recibido), evento('aud.integridad.rota', INTEGRIDAD));

    expect(informes.llamadas.map((llamada) => llamada.mensaje)).toEqual([EVENTO_AVISO_REGISTRADO, EVENTO_AVISO_REGISTRADO]);
    expect(informes.llamadas[0].datos).toMatchObject({ destinatarios: 2, repetidos: 0, estados: { ENCOLADO: 2 } });
    const registrado = JSON.stringify([...informes.llamadas, ...piezas.avisos.llamadas, ...piezas.publicador.eventos]);
    for (const correo of [ANA.correo, LUIS.correo, CORREO_OPERACION]) expect(registrado).not.toContain(correo);
  });
});
