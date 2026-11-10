import { SystemClock } from '@vitrina/plataforma/kernel-infra';
import { VerificarTodosLosTenants } from '../src/application/verificar-todos-los-tenants.js';
import type { MotivoRotura, Verificacion } from '../src/domain/verificacion.js';
import { TenantsConEventosTypeOrm } from '../src/infrastructure/typeorm/registro-verificaciones.typeorm.js';
import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';
import { crearVerificacionReal } from './support/verificacion-real.js';

const FILAS = 10;
const FILA_ALTERADA = 4;

/** Un tenant con filas siempre guarda verificación: null es un fallo de la prueba. */
function guardada(verificacion: Verificacion | null): Verificacion {
  if (!verificacion) throw new Error('se esperaba una verificación guardada');
  return verificacion;
}

describeConDb('Verificación de integridad de la auditoría (spec 20b, TR-RNF-112, PostgreSQL 16)', () => {
  let entorno: EntornoAuditoria;
  let real: ReturnType<typeof crearVerificacionReal>;

  beforeAll(async () => {
    entorno = await crearEntornoAuditoria();
    real = crearVerificacionReal(entorno);
  });

  afterAll(() => entorno?.cerrar());

  /** La rotura deja fila ROTA, log de error y un evento aud.integridad.rota con número y motivo. */
  async function esperarRotura(tenantId: string, resultado: Verificacion | null, numero: string, motivo: MotivoRotura): Promise<void> {
    const verificacion = guardada(resultado);
    expect(verificacion).toMatchObject({ estado: 'ROTA', numeroRoto: numero, motivo });
    expect(real.roturas).toContainEqual({ evento: 'aud.integridad.rota', tenant_id: tenantId, numero_roto: numero, motivo });
    expect(await real.eventosDe(verificacion.id)).toEqual([
      { event_type: 'aud.integridad.rota', payload: { numero_roto: numero, motivo, modo: verificacion.modo, desde_numero: verificacion.desdeNumero } },
    ]);
  }

  it('una cadena sana da OK, y la siguiente corrida incremental solo recorre las filas nuevas', async () => {
    const tenantId = await real.cadena(FILAS);
    const primera = guardada(await real.verificar.ejecutar(tenantId, 'INCREMENTAL'));
    await real.agregar(tenantId, 3);
    const segunda = await real.verificar.ejecutar(tenantId, 'INCREMENTAL');

    expect(primera).toMatchObject({ estado: 'OK', desdeNumero: '0', hastaNumero: String(FILAS), filas: FILAS });
    expect(segunda).toMatchObject({ estado: 'OK', desdeNumero: String(FILAS), hastaNumero: String(FILAS + 3), filas: 3 });
    expect(await real.eventosDe(primera.id)).toEqual([]);
  });

  describe('las 5 alteraciones simuladas se detectan con el número y el motivo correctos', () => {
    it('cambiar despues da HASH', async () => {
      const tenantId = await real.cadena(FILAS);
      await real.alterar(`UPDATE aud.evento_auditoria SET despues = '{"total": 0}' WHERE tenant_id = $1 AND numero = $2`, [tenantId, FILA_ALTERADA]);
      await esperarRotura(tenantId, await real.verificar.ejecutar(tenantId, 'INCREMENTAL'), String(FILA_ALTERADA), 'HASH');
    });

    it('cambiar hash da HASH', async () => {
      const tenantId = await real.cadena(FILAS);
      await real.alterar(`UPDATE aud.evento_auditoria SET hash = repeat('f', 64) WHERE tenant_id = $1 AND numero = $2`, [tenantId, FILA_ALTERADA]);
      await esperarRotura(tenantId, await real.verificar.ejecutar(tenantId, 'INCREMENTAL'), String(FILA_ALTERADA), 'HASH');
    });

    it('cambiar hash_anterior da ENLACE', async () => {
      const tenantId = await real.cadena(FILAS);
      await real.alterar(`UPDATE aud.evento_auditoria SET hash_anterior = repeat('1', 64) WHERE tenant_id = $1 AND numero = $2`, [tenantId, FILA_ALTERADA]);
      await esperarRotura(tenantId, await real.verificar.ejecutar(tenantId, 'INCREMENTAL'), String(FILA_ALTERADA), 'ENLACE');
    });

    it('borrar una fila intermedia da HUECO en el número que falta', async () => {
      const tenantId = await real.cadena(FILAS);
      await real.alterar('DELETE FROM aud.evento_auditoria WHERE tenant_id = $1 AND numero = $2', [tenantId, FILA_ALTERADA]);
      await esperarRotura(tenantId, await real.verificar.ejecutar(tenantId, 'INCREMENTAL'), String(FILA_ALTERADA), 'HUECO');
    });

    it('borrar las últimas filas ya verificadas da TRUNCADA, y la corrida siguiente vuelve a dar ROTA', async () => {
      const tenantId = await real.cadena(FILAS);
      expect(await real.verificar.ejecutar(tenantId, 'INCREMENTAL')).toMatchObject({ estado: 'OK' });
      await real.alterar('DELETE FROM aud.evento_auditoria WHERE tenant_id = $1 AND numero > $2', [tenantId, FILAS - 2]);

      await esperarRotura(tenantId, await real.verificar.ejecutar(tenantId, 'INCREMENTAL'), String(FILAS), 'TRUNCADA');
      expect(await real.verificar.ejecutar(tenantId, 'INCREMENTAL')).toMatchObject({ estado: 'ROTA', motivo: 'TRUNCADA' });
      expect((await real.verificacionesDe(tenantId)).map((fila) => fila.estado)).toEqual(['OK', 'ROTA', 'ROTA']);
    });
  });

  it('COMPLETA recorre desde 0 aunque haya una verificación OK, y detecta lo alterado antes del punto de control', async () => {
    const tenantId = await real.cadena(FILAS);
    await real.verificar.ejecutar(tenantId, 'INCREMENTAL');
    expect(await real.verificar.ejecutar(tenantId, 'COMPLETA')).toMatchObject({ estado: 'OK', desdeNumero: '0', filas: FILAS });

    await real.alterar(`UPDATE aud.evento_auditoria SET despues = '{"total": 0}' WHERE tenant_id = $1 AND numero = 2`, [tenantId]);
    expect(await real.verificar.ejecutar(tenantId, 'INCREMENTAL')).toMatchObject({ estado: 'OK', filas: 0 });
    expect(await real.verificar.ejecutar(tenantId, 'COMPLETA')).toMatchObject({ estado: 'ROTA', numeroRoto: '2', motivo: 'HASH' });
  });

  it('la tarea diaria verifica todos los tenants con filas; el error de uno no detiene a los demás', async () => {
    const sano = await real.cadena(3);
    const conError = await real.cadena(3);
    const avisos: Record<string, unknown>[] = [];
    const todos = new VerificarTodosLosTenants({
      tenants: new TenantsConEventosTypeOrm(entorno.dataSource),
      verificar: {
        ejecutar: (tenantId, modo) => (tenantId === conError ? Promise.reject(new RangeError('caída simulada')) : real.verificar.ejecutar(tenantId, modo)),
      },
      reloj: new SystemClock(),
      informar: () => undefined,
      avisar: (_mensaje, datos) => avisos.push(datos),
    });

    const resultado = await todos.ejecutar();

    expect(resultado.fallidos).toBe(1);
    expect(resultado.tenants).toBe(resultado.ok + resultado.rotas + resultado.fallidos);
    expect(avisos).toEqual([{ tenant_id: conError, error: 'RangeError' }]);
    expect((await real.verificacionesDe(sano)).map((fila) => fila.estado)).toEqual(['OK']);
    expect(await real.verificacionesDe(conError)).toEqual([]);
  });

  it('verificar el tenant A no lee ni guarda nada del tenant B', async () => {
    const tenantA = await real.cadena(2);
    const tenantB = await real.cadena(7);
    expect(await real.verificar.ejecutar(tenantA, 'COMPLETA')).toMatchObject({ tenantId: tenantA, hastaNumero: '2', filas: 2 });
    expect(await real.verificacionesDe(tenantB)).toEqual([]);
  });
});
