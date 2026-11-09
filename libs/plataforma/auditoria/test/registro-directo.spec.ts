import type { TenantScope } from '@vitrina/plataforma/kernel';
import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import type { DependenciasRegistro } from '../src/application/dependencias-registro.js';
import type { FilaAuditoria, RegistroAuditoria } from '../src/application/ports/registro-auditoria.port.js';
import { RegistrarAccesoSensible } from '../src/application/registrar-acceso-sensible.js';
import { RegistrarEvento } from '../src/application/registrar-evento.js';
import { AccionInvalidaError, ActorRequeridoError, TicketRequeridoError } from '../src/domain/errores.js';

const AHORA = new Date('2026-11-09T15:00:00Z');
const ID = '0193f3a0-0000-7000-8000-0000000000a1';
const ALCANCE: TenantScope = {
  tenantId: '0193f3a0-0000-7000-8000-000000000001',
  branchId: '0193f3a0-0000-7000-8000-0000000000b1',
  actorId: '0193f3a0-0000-7000-8000-000000000901',
  ip: '190.42.10.8',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
};

class RegistroEnMemoria implements RegistroAuditoria {
  readonly filas: FilaAuditoria[] = [];

  async insertar(fila: FilaAuditoria): Promise<void> {
    this.filas.push(fila);
  }
}

function crearDependencias(): DependenciasRegistro & { registro: RegistroEnMemoria; contexto: AlsTenantContext } {
  return { contexto: new AlsTenantContext(), ids: { next: () => ID }, reloj: { now: () => AHORA }, registro: new RegistroEnMemoria() };
}

describe('RegistrarEvento (TR-RF-084, TR-RNF-013)', () => {
  it('arma la fila con usuario, sucursal, IP, trace y fecha del contexto, y enmascara antes y después', async () => {
    const dependencias = crearDependencias();
    await dependencias.contexto.run(ALCANCE, () =>
      new RegistrarEvento(dependencias).ejecutar({
        accion: 'rest.venta.anular',
        entidadTipo: 'venta',
        entidadId: 'V-000981',
        antes: { estado: 'EMITIDA', token: 't' },
        despues: { estado: 'ANULADA', tarjeta: '4111' },
        motivo: 'cliente desistió',
        enmascarar: ['tarjeta'],
      }),
    );
    expect(dependencias.registro.filas).toEqual([
      {
        id: ID,
        tenantId: ALCANCE.tenantId,
        origen: 'DIRECTO',
        usuarioId: ALCANCE.actorId,
        sucursalId: ALCANCE.branchId,
        ip: ALCANCE.ip,
        traceId: ALCANCE.traceId,
        ocurridoEn: AHORA,
        tipo: 'OPERACION',
        accion: 'rest.venta.anular',
        entidadTipo: 'venta',
        entidadId: 'V-000981',
        antes: { estado: 'EMITIDA', token: '***' },
        despues: { estado: 'ANULADA', tarjeta: '***' },
        motivo: 'cliente desistió',
      },
    ]);
  });

  it('sin actor queda como sistema; sin antes ni después no los guarda', async () => {
    const dependencias = crearDependencias();
    await dependencias.contexto.run({ tenantId: ALCANCE.tenantId }, () =>
      new RegistrarEvento(dependencias).ejecutar({ accion: 'org.tenant.vencer', entidadTipo: 'tenant', entidadId: 'T-1' }),
    );
    const [fila] = dependencias.registro.filas;
    expect(fila.usuarioId).toBeUndefined();
    expect(fila.antes).toBeUndefined();
    expect(fila.despues).toBeUndefined();
  });

  it('una acción inválida no llega a la base', async () => {
    const dependencias = crearDependencias();
    const registrar = dependencias.contexto.run(ALCANCE, () =>
      new RegistrarEvento(dependencias).ejecutar({ accion: 'AnularVenta', entidadTipo: 'venta', entidadId: 'V-1' }),
    );
    await expect(registrar).rejects.toThrow(AccionInvalidaError);
    expect(dependencias.registro.filas).toEqual([]);
  });
});

describe('RegistrarAccesoSensible (TR-RF-085)', () => {
  const ACCESO = { recursoTipo: 'HISTORIA_CLINICA', recursoId: 'HC-77', personaTitularId: '0193f3a0-0000-7000-8000-000000000501', finalidad: 'ATENCION' } as const;

  it('TR-CA-211: guarda el recurso como entidad, el titular, la finalidad y la acción de acceso sensible', async () => {
    const dependencias = crearDependencias();
    await dependencias.contexto.run(ALCANCE, () => new RegistrarAccesoSensible(dependencias).ejecutar(ACCESO));
    expect(dependencias.registro.filas[0]).toMatchObject({
      tipo: 'ACCESO_SENSIBLE',
      accion: 'aud.dato_sensible.acceder',
      entidadTipo: 'HISTORIA_CLINICA',
      entidadId: 'HC-77',
      personaTitularId: ACCESO.personaTitularId,
      finalidad: 'ATENCION',
      usuarioId: ALCANCE.actorId,
      ocurridoEn: AHORA,
    });
  });

  it('sin actor en el contexto falla con ActorRequeridoError', async () => {
    const dependencias = crearDependencias();
    const registrar = dependencias.contexto.run({ tenantId: ALCANCE.tenantId }, () => new RegistrarAccesoSensible(dependencias).ejecutar(ACCESO));
    await expect(registrar).rejects.toThrow(ActorRequeridoError);
    expect(dependencias.registro.filas).toEqual([]);
  });

  it('TR-CA-212: SOPORTE sin ticket falla en el dominio', async () => {
    const dependencias = crearDependencias();
    const registrar = dependencias.contexto.run(ALCANCE, () =>
      new RegistrarAccesoSensible(dependencias).ejecutar({ ...ACCESO, recursoTipo: 'EXPEDIENTE', finalidad: 'SOPORTE' }),
    );
    await expect(registrar).rejects.toThrow(TicketRequeridoError);
  });
});
