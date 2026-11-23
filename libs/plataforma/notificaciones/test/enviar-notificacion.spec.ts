import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { EnviarNotificacion } from '../src/application/enviar-notificacion.js';
import type { EnviarNotificacionComando } from '../src/application/ports/notificacion.port.js';
import {
  CanalNoHabilitadoError,
  ClaveIdempotenciaInvalidaError,
  DestinoInvalidoError,
  PersonaSinCorreoError,
  PlantillaNoEncontradaError,
  PromocionalSinPersonaError,
  VariableNoPermitidaError,
} from '../src/domain/errores.js';
import { escenario, TENANT_A, TENANT_B } from './support/dobles.js';

const PERSONA = '42000000-0000-7000-8000-0000000000f1';
const VARIABLES = { nombre: 'Ana', producto: 'SazónPOS' };

function comando(cambios: Partial<EnviarNotificacionComando> = {}): EnviarNotificacionComando {
  return {
    plantilla: 'PRUEBA_CORREO',
    destinatario: { correo: ' Ana@Ejemplo.pe ' },
    variables: VARIABLES,
    finalidad: 'TRANSACCIONAL',
    claveIdempotencia: uuidV7(),
    ...cambios,
  };
}

describe('EnviarNotificacion (TR-RF-075, TR-RN-025)', () => {
  let piezas: ReturnType<typeof escenario>;
  let enviar: EnviarNotificacion;

  beforeEach(() => {
    piezas = escenario();
    enviar = new EnviarNotificacion(piezas.envio);
  });

  const enA = (datos: EnviarNotificacionComando) => piezas.enTenant(TENANT_A, () => enviar.enviar(datos));

  it('TR-CA-187: un TRANSACCIONAL a un correo directo queda ENCOLADO y publica la solicitud sin destino', async () => {
    const registrada = await enA(comando());

    expect(registrada).toEqual({ mensajeId: expect.any(String), estado: 'ENCOLADO', repetida: false });
    const guardado = piezas.mensajes.guardado(registrada.mensajeId).instantanea();
    expect(guardado).toMatchObject({
      tenantId: TENANT_A,
      destino: 'ana@ejemplo.pe',
      destinoHash: 'sha256:ana@ejemplo.pe',
      asunto: 'Prueba de correo de SazónPOS',
      cuerpo: '<p>Hola Ana:</p><p>Prueba de SazónPOS.</p>',
      programadoPara: null,
    });
    expect(piezas.publicador.eventos).toHaveLength(1);
    const [evento] = piezas.publicador.eventos;
    expect(evento).toMatchObject({ eventType: 'not.mensaje.solicitado', aggregateType: 'mensaje', aggregateId: registrada.mensajeId });
    expect(evento.payload).toEqual({ mensaje_id: registrada.mensajeId });
    expect(JSON.stringify(evento)).not.toContain('ejemplo.pe');
    expect(JSON.stringify(evento)).not.toContain('Ana');
  });

  it('TR-RNF-008: la misma clave devuelve el mismo mensaje con repetida, sin otro evento', async () => {
    const datos = comando();
    const primero = await enA(datos);
    const segundo = await enA({ ...datos, variables: { nombre: 'Otra', producto: 'X' } });

    expect(segundo).toEqual({ ...primero, repetida: true });
    expect(piezas.mensajes.filas.size).toBe(1);
    expect(piezas.publicador.eventos).toHaveLength(1);
  });

  it('la misma clave en otro tenant es otro mensaje', async () => {
    const datos = comando();
    await enA(datos);
    const enB = await piezas.enTenant(TENANT_B, () => enviar.enviar(datos));

    expect(enB.repetida).toBe(false);
    expect(piezas.mensajes.filas.size).toBe(2);
  });

  it('con personaId el destino es el correo principal de la persona', async () => {
    piezas.personas.correos.set(PERSONA, [
      { valor: 'otro@ejemplo.pe', principal: false },
      { valor: 'Principal@Ejemplo.pe', principal: true },
    ]);

    const registrada = await enA(comando({ destinatario: { personaId: PERSONA } }));

    expect(piezas.mensajes.guardado(registrada.mensajeId).instantanea()).toMatchObject({ destino: 'principal@ejemplo.pe', personaId: PERSONA });
  });

  it('sin correo principal usa el primero de tipo correo', async () => {
    piezas.personas.correos.set(PERSONA, [{ valor: 'unico@ejemplo.pe', principal: false }]);

    const registrada = await enA(comando({ destinatario: { personaId: PERSONA } }));

    expect(piezas.mensajes.guardado(registrada.mensajeId).instantanea().destino).toBe('unico@ejemplo.pe');
  });

  it('persona sin correo → PersonaSinCorreoError y no se inserta mensaje', async () => {
    await expect(enA(comando({ destinatario: { personaId: PERSONA } }))).rejects.toThrow(PersonaSinCorreoError);
    expect(piezas.mensajes.filas.size).toBe(0);
    expect(piezas.publicador.eventos).toHaveLength(0);
  });

  it('TR-CA-188: PROMOCIONAL sin PROMOCIONES vigente queda OMITIDO_SIN_CONSENTIMIENTO, sin evento', async () => {
    piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);

    const registrada = await enA(comando({ destinatario: { personaId: PERSONA }, finalidad: 'PROMOCIONAL' }));

    expect(registrada.estado).toBe('OMITIDO_SIN_CONSENTIMIENTO');
    expect(piezas.consentimientos.consultas).toEqual(['PROMOCIONES']);
    expect(piezas.mensajes.filas.size).toBe(1);
    expect(piezas.publicador.eventos).toHaveLength(0);
  });

  it('TR-CA-188: PROMOCIONAL sin personaId → PromocionalSinPersonaError', async () => {
    await expect(enA(comando({ finalidad: 'PROMOCIONAL' }))).rejects.toThrow(PromocionalSinPersonaError);
    expect(piezas.mensajes.filas.size).toBe(0);
  });

  it('PROMOCIONAL con consentimiento dentro de la ventana sale sin programar', async () => {
    piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);
    piezas.consentimientos.conPromociones.add(PERSONA);

    const registrada = await enA(comando({ destinatario: { personaId: PERSONA }, finalidad: 'PROMOCIONAL' }));

    expect(registrada).toMatchObject({ estado: 'ENCOLADO' });
    expect(registrada.programadoPara).toBeUndefined();
  });

  it('TR-CA-189: PROMOCIONAL a las 21:30 de Lima se programa a las 08:00 del día siguiente; TRANSACCIONAL sale ya', async () => {
    piezas.reloj.instante = new Date('2026-11-21T02:30:00Z');
    piezas.personas.correos.set(PERSONA, [{ valor: 'ana@ejemplo.pe', principal: true }]);
    piezas.consentimientos.conPromociones.add(PERSONA);

    const promocional = await enA(comando({ destinatario: { personaId: PERSONA }, finalidad: 'PROMOCIONAL' }));
    const transaccional = await enA(comando({ destinatario: { personaId: PERSONA } }));

    expect(promocional.programadoPara).toEqual(new Date('2026-11-21T13:00:00Z'));
    expect(piezas.publicador.eventos[0].payload).toEqual({ mensaje_id: promocional.mensajeId, programado_para: '2026-11-21T13:00:00.000Z' });
    expect(transaccional.programadoPara).toBeUndefined();
    expect(piezas.publicador.eventos[1].payload).toEqual({ mensaje_id: transaccional.mensajeId });
  });

  it('TR-CA-198: un destino marcado inválido en el tenant queda DESCARTADO, sin evento', async () => {
    await piezas.enTenant(TENANT_A, () => piezas.contactosInvalidos.marcar('CORREO', 'sha256:ana@ejemplo.pe', 'REBOTE_DURO'));

    const registrada = await enA(comando());
    const enB = await piezas.enTenant(TENANT_B, () => enviar.enviar(comando()));

    expect(registrada.estado).toBe('DESCARTADO');
    expect(piezas.mensajes.guardado(registrada.mensajeId).instantanea().motivoFallo).toBe('CONTACTO_INVALIDO');
    expect(enB.estado).toBe('ENCOLADO');
    expect(piezas.publicador.eventos).toHaveLength(1);
  });

  it('rechaza canal no habilitado, clave que no es UUID, destino inválido, plantilla inexistente y variable no declarada', async () => {
    await expect(enA({ ...comando(), canal: 'SMS' as 'CORREO' })).rejects.toThrow(CanalNoHabilitadoError);
    await expect(enA(comando({ claveIdempotencia: 'clave-1' }))).rejects.toThrow(ClaveIdempotenciaInvalidaError);
    await expect(enA(comando({ destinatario: { correo: 'ana@' } }))).rejects.toThrow(DestinoInvalidoError);
    await expect(enA(comando({ plantilla: 'NO_EXISTE' }))).rejects.toThrow(PlantillaNoEncontradaError);
    await expect(enA(comando({ variables: { ...VARIABLES, diagnostico: 'gripe' } }))).rejects.toThrow('Variable no permitida: diagnostico');
    await expect(enA(comando({ variables: { ...VARIABLES, diagnostico: 'gripe' } }))).rejects.toThrow(VariableNoPermitidaError);
    expect(piezas.mensajes.filas.size).toBe(0);
  });

  it('TR-RNF-007: enviar no llama al proveedor (responde igual con el proveedor caído)', async () => {
    piezas.proveedor.responder(new Error('caído'));

    await expect(enA(comando())).resolves.toMatchObject({ estado: 'ENCOLADO' });
    expect(piezas.proveedor.enviados).toHaveLength(0);
  });
});
