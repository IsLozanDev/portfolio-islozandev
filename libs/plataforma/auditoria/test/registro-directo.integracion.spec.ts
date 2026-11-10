import { NoActiveTransactionError, type TenantScope } from '@vitrina/plataforma/kernel';
import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { EntradaAuditoria } from '../src/domain/entradas.js';
import { ActorRequeridoError, AuditoriaNoDisponibleError, TicketRequeridoError } from '../src/domain/errores.js';
import { cadenaValida, crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const SUCURSAL = '0193f3a0-0000-7000-8000-0000000000b1';
const IP = '190.42.10.8';
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const REGISTROS_EN_PARALELO = 50;

describeConDb('Registro directo de auditoría con PostgreSQL 16 (TR-RF-084, TR-RF-085)', () => {
  let entorno: EntornoAuditoria;

  beforeAll(async () => {
    entorno = await crearEntornoAuditoria();
  });

  afterAll(async () => {
    await entorno?.cerrar();
  });

  const alcanceNuevo = (cambios: Partial<TenantScope> = {}): TenantScope => ({
    tenantId: uuidV7(),
    branchId: SUCURSAL,
    actorId: uuidV7(),
    ip: IP,
    traceId: TRACE_ID,
    ...cambios,
  });

  const enTransaccion = <T>(alcance: TenantScope, trabajo: () => Promise<T>) =>
    entorno.contexto.run(alcance, () => entorno.unidadDeTrabajo.run(trabajo));

  /** Caso de uso de prueba: anula una venta y registra antes y después. Puede fallar tras registrar. */
  const anularVenta = (alcance: TenantScope, numero: string, fallarDespues = false) =>
    enTransaccion(alcance, async () => {
      await entorno.registrarEvento.ejecutar({
        accion: 'rest.venta.anular',
        entidadTipo: 'venta',
        entidadId: numero,
        antes: { numero, estado: 'EMITIDA' },
        despues: { numero, estado: 'ANULADA' },
        motivo: 'cliente desistió',
      });
      if (fallarDespues) throw new Error('sin stock');
    });

  it('TR-CA-209: la anulación de V-000981 deja antes, después, motivo y hash encadenado al anterior del tenant', async () => {
    const alcance = alcanceNuevo();
    await anularVenta(alcance, 'V-000980');
    await anularVenta(alcance, 'V-000981');

    const filas = await entorno.filas(alcance.tenantId);
    expect(filas).toHaveLength(2);
    expect(filas[1]).toMatchObject({
      tipo: 'OPERACION',
      origen: 'DIRECTO',
      event_id: null,
      accion: 'rest.venta.anular',
      entidad_tipo: 'venta',
      entidad_id: 'V-000981',
      antes: { numero: 'V-000981', estado: 'EMITIDA' },
      despues: { numero: 'V-000981', estado: 'ANULADA' },
      motivo: 'cliente desistió',
      usuario_id: alcance.actorId,
      sucursal_id: SUCURSAL,
      ip: IP,
      trace_id: TRACE_ID,
      hash_anterior: filas[0].hash,
    });
    expect(cadenaValida(filas)).toBe(true);
  });

  it('si el caso de uso se revierte después de registrar, no queda fila', async () => {
    const alcance = alcanceNuevo();
    await expect(anularVenta(alcance, 'V-000982', true)).rejects.toThrow('sin stock');
    expect(await entorno.filas(alcance.tenantId)).toHaveLength(0);
  });

  it('sin transacción activa lanza NoActiveTransactionError', async () => {
    const alcance = alcanceNuevo();
    const entrada: EntradaAuditoria = { accion: 'rest.venta.anular', entidadTipo: 'venta', entidadId: 'V-1' };
    await entorno.contexto.run(alcance, async () => {
      await expect(entorno.registrarEvento.ejecutar(entrada)).rejects.toThrow(NoActiveTransactionError);
    });
  });

  it('si la inserción falla: AuditoriaNoDisponibleError, nada confirmado y un log sin antes, después ni motivo', async () => {
    const alcance = alcanceNuevo();
    const entidadTipoMasLargoQueLaColumna = 'x'.repeat(41);
    const registrar = enTransaccion(alcance, () =>
      entorno.registrarEvento.ejecutar({
        accion: 'rest.venta.anular',
        entidadTipo: entidadTipoMasLargoQueLaColumna,
        entidadId: 'V-1',
        antes: { estado: 'EMITIDA' },
        motivo: 'motivo privado',
      }),
    );
    await expect(registrar).rejects.toThrow(AuditoriaNoDisponibleError);
    expect(await entorno.filas(alcance.tenantId)).toHaveLength(0);
    const aviso = entorno.avisos.find(({ datos }) => datos['tenant_id'] === alcance.tenantId);
    expect(aviso?.mensaje).toBe('aud.registro.error');
    expect(JSON.stringify(aviso)).not.toMatch(/EMITIDA|motivo privado/);
  });

  it('las claves por defecto y las extra quedan *** en antes y después', async () => {
    const alcance = alcanceNuevo();
    await enTransaccion(alcance, () =>
      entorno.registrarEvento.ejecutar({
        accion: 'seg.usuario.actualizar',
        entidadTipo: 'usuario',
        entidadId: 'U-1',
        antes: { nombre: 'Ana', clave: 'vieja', tarjeta: '4111' },
        despues: { nombre: 'Ana', clave: 'nueva', tarjeta: '4222' },
        enmascarar: ['tarjeta'],
      }),
    );
    const [fila] = await entorno.filas(alcance.tenantId);
    expect(fila.antes).toEqual({ nombre: 'Ana', clave: '***', tarjeta: '***' });
    expect(fila.despues).toEqual({ nombre: 'Ana', clave: '***', tarjeta: '***' });
  });

  it('50 registros en paralelo de un tenant dejan numero 1 a 50 sin huecos y la cadena es válida', async () => {
    const alcance = alcanceNuevo();
    await Promise.all(
      Array.from({ length: REGISTROS_EN_PARALELO }, (_, indice) => anularVenta(alcance, `V-${String(indice).padStart(6, '0')}`)),
    );
    const filas = await entorno.filas(alcance.tenantId);
    expect(filas.map((fila) => Number(fila.numero))).toEqual(Array.from({ length: REGISTROS_EN_PARALELO }, (_, indice) => indice + 1));
    expect(cadenaValida(filas)).toBe(true);
  });

  it('TR-CA-211: un médico que abre la historia clínica de un titular deja usuario, finalidad ATENCION y fecha', async () => {
    const alcance = alcanceNuevo();
    const titular = uuidV7();
    await enTransaccion(alcance, () =>
      entorno.registrarAccesoSensible.ejecutar({ recursoTipo: 'HISTORIA_CLINICA', recursoId: 'HC-77', personaTitularId: titular, finalidad: 'ATENCION' }),
    );
    const [fila] = await entorno.filas(alcance.tenantId);
    expect(fila).toMatchObject({
      tipo: 'ACCESO_SENSIBLE',
      accion: 'aud.dato_sensible.acceder',
      entidad_tipo: 'HISTORIA_CLINICA',
      entidad_id: 'HC-77',
      usuario_id: alcance.actorId,
      persona_titular_id: titular,
      finalidad: 'ATENCION',
      ticket: null,
    });
    expect(fila.ocurrido_en).toBeInstanceOf(Date);
  });

  it('TR-CA-212: un agente con SOPORTE deja su ticket; sin ticket falla y no deja fila', async () => {
    const alcance = alcanceNuevo();
    const acceso = { recursoTipo: 'EXPEDIENTE', recursoId: 'EXP-9', personaTitularId: uuidV7(), finalidad: 'SOPORTE' } as const;
    await enTransaccion(alcance, () => entorno.registrarAccesoSensible.ejecutar({ ...acceso, ticket: 'TCK-1042' }));
    await expect(enTransaccion(alcance, () => entorno.registrarAccesoSensible.ejecutar(acceso))).rejects.toThrow(TicketRequeridoError);

    const filas = await entorno.filas(alcance.tenantId);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ entidad_tipo: 'EXPEDIENTE', finalidad: 'SOPORTE', ticket: 'TCK-1042' });
  });

  it('sin actor en el contexto, registrarAccesoSensible falla y no deja fila', async () => {
    const alcance = alcanceNuevo({ actorId: undefined });
    const registrar = enTransaccion(alcance, () =>
      entorno.registrarAccesoSensible.ejecutar({ recursoTipo: 'NOTA_SESION', recursoId: 'NS-1', personaTitularId: uuidV7(), finalidad: 'ATENCION' }),
    );
    await expect(registrar).rejects.toThrow(ActorRequeridoError);
    expect(await entorno.filas(alcance.tenantId)).toHaveLength(0);
  });
});
