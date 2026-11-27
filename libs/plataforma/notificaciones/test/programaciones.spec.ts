import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { Baja } from '../src/domain/baja.js';
import { BarrerProgramacionesAtrasadas, LIMITE_BARRIDO, MARGEN_ATRASO_MS } from '../src/application/programaciones/barrer-programaciones-atrasadas.js';
import { CancelarProgramaciones } from '../src/application/programaciones/cancelar-programaciones.js';
import { EjecutarProgramacion } from '../src/application/programaciones/ejecutar-programacion.js';
import { EncolarProgramacion } from '../src/application/programaciones/encolar-programacion.js';
import { ProgramarNotificacion } from '../src/application/programaciones/programar-notificacion.js';
import type { ProgramarNotificacionComando } from '../src/application/ports/notificacion.port.js';
import { ServicioNotificaciones } from '../src/application/servicio-notificaciones.js';
import {
  CanalNoHabilitadoError,
  FechaEnvioNoFuturaError,
  PlantillaNoEncontradaError,
  ProgramacionModificadaError,
  PromocionalSinPersonaError,
  ReferenciaInvalidaError,
  VariablesIncompletasError,
} from '../src/domain/errores.js';
import { ColaProgramacionesBullmq, NOMBRE_TRABAJO_EJECUCION, type ColaBullmqProgramaciones } from '../src/infrastructure/bullmq/cola-programaciones.js';
import { AHORA, TENANT_A, TENANT_B } from './support/dobles.js';
import { escenarioProgramaciones } from './support/dobles-programaciones.js';

const UNA_HORA_MS = 3_600_000;
const EN_UNA_HORA = new Date(AHORA.getTime() + UNA_HORA_MS);
const REFERENCIA = { tipo: 'psi.cita', id: 'cita-1' };
const PERSONA = '45000000-0000-7000-8000-0000000000f1';

function comando(cambios: Partial<ProgramarNotificacionComando> = {}): ProgramarNotificacionComando {
  return {
    plantilla: 'PRUEBA_CORREO',
    destinatario: { correo: 'ana@ejemplo.pe' },
    variables: { nombre: 'Ana', producto: 'SazónPOS' },
    finalidad: 'TRANSACCIONAL',
    enviarEn: EN_UNA_HORA,
    referencia: REFERENCIA,
    ...cambios,
  };
}

describe('Recordatorios programados (spec 45, TR-RF-076)', () => {
  let piezas: ReturnType<typeof escenarioProgramaciones>;
  let programar: ProgramarNotificacion;
  let cancelar: CancelarProgramaciones;
  let ejecutar: EjecutarProgramacion;

  beforeEach(() => {
    piezas = escenarioProgramaciones();
    programar = new ProgramarNotificacion(piezas.programacion);
    cancelar = new CancelarProgramaciones(piezas.programacion);
    ejecutar = new EjecutarProgramacion(piezas.ejecucion);
  });

  const enA = <Resultado>(trabajo: () => Promise<Resultado>) => piezas.enTenant(TENANT_A, trabajo);
  const programarEnA = (datos: ProgramarNotificacionComando = comando()) => enA(() => programar.ejecutar(datos));
  const eventosDeProgramacion = () => piezas.publicador.eventos.filter((evento) => evento.eventType === 'not.programacion.registrada');
  const trabajoDe = (programacionId: string) => {
    const { tenantId, version } = piezas.programaciones.guardada(programacionId).instantanea();
    return { tenantId, programacionId, version };
  };
  const alaHora = (programacionId: string) => {
    piezas.reloj.instante = piezas.programaciones.guardada(programacionId).enviarEn;
    return ejecutar.ejecutar(trabajoDe(programacionId));
  };

  describe('programar', () => {
    it('guarda la programación viva y publica not.programacion.registrada sin destinatario ni variables', async () => {
      const programada = await programarEnA();

      expect(programada).toEqual({ programacionId: expect.any(String), enviarEn: EN_UNA_HORA, reprogramada: false });
      expect(piezas.programaciones.guardada(programada.programacionId).instantanea()).toMatchObject({
        tenantId: TENANT_A,
        referencia: REFERENCIA,
        plantillaCodigo: 'PRUEBA_CORREO',
        estado: 'PROGRAMADA',
        version: 1,
      });
      const [evento] = eventosDeProgramacion();
      expect(evento).toMatchObject({ aggregateType: 'programacion', aggregateId: programada.programacionId, aggregateVersion: 1 });
      expect(evento.payload).toEqual({ programacion_id: programada.programacionId, version: 1, enviar_en: EN_UNA_HORA.toISOString() });
      expect(JSON.stringify(evento)).not.toContain('ejemplo.pe');
      expect(JSON.stringify(evento)).not.toContain('Ana');
    });

    it('TR-RNF-008: la misma referencia y plantilla reprograma la viva: una sola programación, versión 2 y otro evento', async () => {
      const primera = await programarEnA();
      const nuevaHora = new Date(AHORA.getTime() + 2 * UNA_HORA_MS);

      const segunda = await programarEnA(comando({ enviarEn: nuevaHora, destinatario: { correo: 'beto@ejemplo.pe' } }));

      expect(segunda).toEqual({ programacionId: primera.programacionId, enviarEn: nuevaHora, reprogramada: true });
      expect(piezas.programaciones.filas.size).toBe(1);
      expect(piezas.programaciones.guardada(primera.programacionId).instantanea()).toMatchObject({ version: 2, enviarEn: nuevaHora });
      expect(eventosDeProgramacion().map((evento) => evento.payload)).toEqual([
        expect.objectContaining({ version: 1 }),
        { programacion_id: primera.programacionId, version: 2, enviar_en: nuevaHora.toISOString() },
      ]);
    });

    it('otra plantilla u otro tenant con la misma referencia es otra programación', async () => {
      piezas.plantillas.plantillas.push({ ...piezas.plantillas.plantillas[0], id: '45000000-0000-0000-0000-0000000000c2', codigo: 'OTRA_PLANTILLA' });

      await programarEnA();
      await programarEnA(comando({ plantilla: 'OTRA_PLANTILLA' }));
      await piezas.enTenant(TENANT_B, () => programar.ejecutar(comando()));

      expect(piezas.programaciones.filas.size).toBe(3);
    });

    it('TR-CA-192: enviarEn igual a ahora → FechaEnvioNoFuturaError y no se guarda nada', async () => {
      await expect(programarEnA(comando({ enviarEn: AHORA }))).rejects.toThrow(FechaEnvioNoFuturaError);

      expect(piezas.programaciones.filas.size).toBe(0);
      expect(piezas.publicador.eventos).toEqual([]);
    });

    it('plantilla inexistente → PlantillaNoEncontradaError; canal distinto de CORREO → CanalNoHabilitadoError', async () => {
      await expect(programarEnA(comando({ plantilla: 'NO_EXISTE' }))).rejects.toThrow(PlantillaNoEncontradaError);
      await expect(programarEnA(comando({ canal: 'SMS' as 'CORREO' }))).rejects.toThrow(CanalNoHabilitadoError);
      expect(piezas.programaciones.filas.size).toBe(0);
    });

    it('valida las variables con la plantilla al programar, la referencia y que un PROMOCIONAL lleve personaId', async () => {
      await expect(programarEnA(comando({ variables: { nombre: 'Ana' } }))).rejects.toThrow(VariablesIncompletasError);
      await expect(programarEnA(comando({ referencia: { tipo: 'Cita', id: '1' } }))).rejects.toThrow(ReferenciaInvalidaError);
      await expect(programarEnA(comando({ finalidad: 'PROMOCIONAL' }))).rejects.toThrow(PromocionalSinPersonaError);
      expect(piezas.programaciones.filas.size).toBe(0);
    });
  });

  describe('cancelar', () => {
    it('TR-CA-191: cancela la viva de la referencia antes de la hora y a la hora no se crea mensaje', async () => {
      const { programacionId } = await programarEnA();
      const trabajo = trabajoDe(programacionId);

      expect(await enA(() => cancelar.ejecutar(REFERENCIA))).toBe(1);
      piezas.reloj.instante = EN_UNA_HORA;
      expect(await ejecutar.ejecutar(trabajo)).toBe('SIN_EFECTO');

      expect(piezas.programaciones.guardada(programacionId).estado).toBe('CANCELADA');
      expect(piezas.mensajes.filas.size).toBe(0);
    });

    it('sin vivas devuelve 0; con plantilla solo cancela la de esa plantilla', async () => {
      piezas.plantillas.plantillas.push({ ...piezas.plantillas.plantillas[0], id: '45000000-0000-0000-0000-0000000000c2', codigo: 'OTRA_PLANTILLA' });
      expect(await enA(() => cancelar.ejecutar(REFERENCIA))).toBe(0);
      await programarEnA();
      const otra = await programarEnA(comando({ plantilla: 'OTRA_PLANTILLA' }));

      expect(await enA(() => cancelar.ejecutar(REFERENCIA, 'PRUEBA_CORREO'))).toBe(1);

      expect(piezas.programaciones.guardada(otra.programacionId).estado).toBe('PROGRAMADA');
    });

    it('TR-RNF-010: un tenant no cancela las programaciones de otro', async () => {
      const { programacionId } = await programarEnA();

      expect(await piezas.enTenant(TENANT_B, () => cancelar.ejecutar(REFERENCIA))).toBe(0);

      expect(piezas.programaciones.guardada(programacionId).estado).toBe('PROGRAMADA');
    });
  });

  describe('ejecución a la hora', () => {
    it('TR-CA-190: crea el mensaje con la plantilla vigente y deja la programación ENVIADA con su mensaje_id', async () => {
      const { programacionId } = await programarEnA();

      expect(await alaHora(programacionId)).toBe('ENVIADA');

      const { estado, mensajeId } = piezas.programaciones.guardada(programacionId).instantanea();
      expect(estado).toBe('ENVIADA');
      expect(piezas.mensajes.guardado(mensajeId ?? '').instantanea()).toMatchObject({
        estado: 'ENCOLADO',
        claveIdempotencia: programacionId,
        destino: 'ana@ejemplo.pe',
        asunto: 'Prueba de correo de SazónPOS',
      });
    });

    it('la misma ejecución repetida no duplica el mensaje (claveIdempotencia = id de la programación)', async () => {
      const { programacionId } = await programarEnA();
      const trabajo = trabajoDe(programacionId);
      piezas.reloj.instante = EN_UNA_HORA;

      await ejecutar.ejecutar(trabajo);
      expect(await ejecutar.ejecutar(trabajo)).toBe('SIN_EFECTO');

      expect(piezas.mensajes.filas.size).toBe(1);
    });

    it('el trabajo de una versión vieja no envía; el de la nueva envía una sola vez a la hora nueva', async () => {
      const { programacionId } = await programarEnA();
      const trabajoViejo = trabajoDe(programacionId);
      await programarEnA(comando({ enviarEn: new Date(AHORA.getTime() + 2 * UNA_HORA_MS) }));

      piezas.reloj.instante = EN_UNA_HORA;
      expect(await ejecutar.ejecutar(trabajoViejo)).toBe('SIN_EFECTO');
      expect(piezas.mensajes.filas.size).toBe(0);
      expect(await alaHora(programacionId)).toBe('ENVIADA');

      expect(piezas.mensajes.filas.size).toBe(1);
    });

    it('un contacto marcado inválido después de programar → DESCARTADA con el motivo, sin mensaje para entregar', async () => {
      const { programacionId } = await programarEnA();
      await enA(() => piezas.contactosInvalidos.marcar('CORREO', 'sha256:ana@ejemplo.pe', 'REBOTE_DURO'));

      expect(await alaHora(programacionId)).toBe('DESCARTADA');

      const { estado, motivo, mensajeId } = piezas.programaciones.guardada(programacionId).instantanea();
      expect({ estado, motivo }).toEqual({ estado: 'DESCARTADA', motivo: 'DESCARTADO' });
      expect(piezas.mensajes.guardado(mensajeId ?? '').estado).toBe('DESCARTADO');
      expect(piezas.publicador.eventos.filter((evento) => evento.eventType === 'not.mensaje.solicitado')).toEqual([]);
    });

    it('spec 46: una baja CANAL hecha después de programar → DESCARTADA con el motivo, sin correo', async () => {
      const { programacionId } = await programarEnA();
      await enA(() =>
        piezas.bajas.registrar(
          Baja.registrar({ id: uuidV7(), tenantId: TENANT_A, canal: 'CORREO', alcance: 'CANAL', destinoHash: 'sha256:ana@ejemplo.pe', personaId: null }),
        ),
      );

      expect(await alaHora(programacionId)).toBe('DESCARTADA');

      const { motivo, mensajeId } = piezas.programaciones.guardada(programacionId).instantanea();
      expect(motivo).toBe('DESCARTADO');
      expect(piezas.mensajes.guardado(mensajeId ?? '').instantanea().motivoFallo).toBe('BAJA_CANAL');
      expect(piezas.publicador.eventos.filter((evento) => evento.eventType === 'not.mensaje.solicitado')).toEqual([]);
    });

    it('un PROMOCIONAL sin consentimiento a la hora → DESCARTADA con OMITIDO_SIN_CONSENTIMIENTO', async () => {
      piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);
      piezas.consentimientos.conPromociones.add(PERSONA);
      const { programacionId } = await programarEnA(comando({ finalidad: 'PROMOCIONAL', destinatario: { personaId: PERSONA } }));
      piezas.consentimientos.conPromociones.delete(PERSONA);

      expect(await alaHora(programacionId)).toBe('DESCARTADA');

      expect(piezas.programaciones.guardada(programacionId).instantanea().motivo).toBe('OMITIDO_SIN_CONSENTIMIENTO');
    });

    it('TR-CA-189: un PROMOCIONAL que vence a las 21:30 de Lima sale a las 08:00 del día siguiente', async () => {
      piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);
      piezas.consentimientos.conPromociones.add(PERSONA);
      const alas2130DeLima = new Date('2026-11-21T02:30:00.000Z');
      const { programacionId } = await programarEnA(comando({ finalidad: 'PROMOCIONAL', destinatario: { personaId: PERSONA }, enviarEn: alas2130DeLima }));

      expect(await alaHora(programacionId)).toBe('ENVIADA');

      const { mensajeId } = piezas.programaciones.guardada(programacionId).instantanea();
      expect(piezas.mensajes.guardado(mensajeId ?? '').programadoPara).toEqual(new Date('2026-11-21T13:00:00.000Z'));
    });

    it('un error de dominio de enviar (la plantilla ya no acepta las variables) → DESCARTADA con su código', async () => {
      const { programacionId } = await programarEnA();
      piezas.plantillas.plantillas = [{ ...piezas.plantillas.plantillas[0], cuerpo: '<p>{{nombre}} {{apellido}}</p>', variables: [...piezas.plantillas.plantillas[0].variables, { nombre: 'apellido', tipo: 'texto' }] }];

      expect(await alaHora(programacionId)).toBe('DESCARTADA');

      expect(piezas.programaciones.guardada(programacionId).instantanea()).toMatchObject({ motivo: 'VARIABLES_INCOMPLETAS', mensajeId: null });
      expect(piezas.mensajes.filas.size).toBe(0);
    });

    it('un conflicto al guardar se relanza para que BullMQ reintente', async () => {
      const { programacionId } = await programarEnA();
      const trabajo = trabajoDe(programacionId);
      piezas.ejecucion.programaciones.actualizar = () => Promise.reject(new ProgramacionModificadaError());
      piezas.reloj.instante = EN_UNA_HORA;

      await expect(ejecutar.ejecutar(trabajo)).rejects.toThrow(ProgramacionModificadaError);
    });

    it('con el tenant del trabajo: una programación de otro tenant no existe', async () => {
      const { programacionId } = await programarEnA();

      expect(await ejecutar.ejecutar({ ...trabajoDe(programacionId), tenantId: TENANT_B })).toBe('SIN_EFECTO');
    });
  });

  describe('encolado y barrido', () => {
    it('el consumidor encola con la versión y la hora del evento', async () => {
      await new EncolarProgramacion(piezas.barrido).ejecutar(TENANT_A, {
        programacion_id: '45000000-0000-7000-8000-0000000000a1',
        version: 2,
        enviar_en: EN_UNA_HORA.toISOString(),
      });

      expect([...piezas.cola.trabajos.entries()]).toEqual([
        ['45000000-0000-7000-8000-0000000000a1-2', { tenantId: TENANT_A, programacionId: '45000000-0000-7000-8000-0000000000a1', version: 2, enviarEn: EN_UNA_HORA }],
      ]);
    });

    it('TR-RNF-005: el barrido encola las PROGRAMADA vencidas hace más de 5 min, de todos los tenants, sin duplicar', async () => {
      const atrasada = await programarEnA();
      const reciente = await programarEnA(comando({ referencia: { tipo: 'psi.cita', id: 'cita-2' }, enviarEn: new Date(EN_UNA_HORA.getTime() + 4 * 60_000) }));
      const deB = await piezas.enTenant(TENANT_B, () => programar.ejecutar(comando()));
      const barrer = new BarrerProgramacionesAtrasadas(piezas.barrido);
      piezas.reloj.instante = new Date(EN_UNA_HORA.getTime() + 8 * 60_000);

      expect(await barrer.ejecutar()).toEqual({ encoladas: 2 });
      await barrer.ejecutar();

      expect(piezas.localizador.cortes[0]).toEqual({ antes: new Date(piezas.reloj.instante.getTime() - MARGEN_ATRASO_MS), limite: LIMITE_BARRIDO });
      expect([...piezas.cola.trabajos.keys()].sort()).toEqual([`${atrasada.programacionId}-1`, `${deB.programacionId}-1`].sort());
      expect(piezas.cola.trabajos.has(`${reciente.programacionId}-1`)).toBe(false);
    });

    it('la cola BullMQ usa jobId = programacionId-version, retardo hasta enviarEn y borra los terminados', async () => {
      const agregados: { nombre: string; trabajo: unknown; opciones: Record<string, unknown> }[] = [];
      const bullmq: ColaBullmqProgramaciones = {
        add: async (nombre, trabajo, opciones) => agregados.push({ nombre, trabajo, opciones: opciones as Record<string, unknown> }),
      };
      const cola = new ColaProgramacionesBullmq(bullmq, piezas.reloj);
      const trabajo = { tenantId: TENANT_A, programacionId: '45000000-0000-7000-8000-0000000000a1', version: 3 };

      await cola.encolar({ ...trabajo, enviarEn: EN_UNA_HORA });
      await cola.encolar({ ...trabajo, enviarEn: new Date(AHORA.getTime() - 1) });

      expect(agregados[0]).toEqual({
        nombre: NOMBRE_TRABAJO_EJECUCION,
        trabajo,
        opciones: expect.objectContaining({ jobId: `${trabajo.programacionId}-3`, delay: UNA_HORA_MS, removeOnComplete: true, removeOnFail: true }),
      });
      expect(agregados[1].opciones.delay).toBe(0);
    });
  });

  it('ServicioNotificaciones expone enviar, programar y cancelar en el mismo puerto', async () => {
    const servicio = new ServicioNotificaciones({ enviar: piezas.enviar, programar, cancelar });

    const programada = await enA(() => servicio.programar(comando()));
    expect(await enA(() => servicio.cancelar(REFERENCIA))).toBe(1);
    const registrada = await enA(() =>
      servicio.enviar({ ...comando(), claveIdempotencia: programada.programacionId }),
    );

    expect(registrada.estado).toBe('ENCOLADO');
  });
});
