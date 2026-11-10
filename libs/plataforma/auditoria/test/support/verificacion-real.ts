import { InMemoryEventSchemaValidator, OutboxPublisher, SystemClock, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { VerificarIntegridad } from '../../src/application/verificar-integridad.js';
import { registrarEsquemasAud } from '../../src/infrastructure/event-schemas.js';
import { RegistroVerificacionesTypeOrm } from '../../src/infrastructure/typeorm/registro-verificaciones.typeorm.js';
import type { EntornoAuditoria } from './entorno.js';
import { crearSemilla } from './semilla-consulta.js';

/** VerificarIntegridad con la base, el outbox y el validador de eventos reales. Junta los logs de rotura. */
export function crearVerificacionReal(entorno: EntornoAuditoria) {
  const validador = new InMemoryEventSchemaValidator();
  registrarEsquemasAud(validador);
  const ids = { next: uuidV7 };
  const roturas: Record<string, unknown>[] = [];
  const verificar = new VerificarIntegridad({
    unidadDeTrabajo: entorno.unidadDeTrabajo,
    contexto: entorno.contexto,
    ids,
    reloj: new SystemClock(),
    eventos: new OutboxPublisher(entorno.unidadDeTrabajo, entorno.contexto, validador, ids),
    registro: new RegistroVerificacionesTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
    avisarRotura: (datos) => roturas.push(datos),
  });
  const semilla = crearSemilla(entorno.dataSource);

  return {
    verificar,
    roturas,
    /** Tenant con una cadena de `filas` operaciones, encadenadas por el trigger. */
    async cadena(filas: number): Promise<string> {
      const { tenantId } = await semilla.tenant();
      await agregar(entorno, tenantId, filas);
      return tenantId;
    },
    agregar: (tenantId: string, filas: number) => agregar(entorno, tenantId, filas),
    /**
     * Simula un ataque con privilegios: con la conexión de prueba (superusuario) desactiva el trigger de
     * solo inserción, ejecuta la sentencia y lo vuelve a activar, todo en la misma transacción.
     */
    async alterar(sentencia: string, parametros: unknown[]): Promise<void> {
      const conexion = entorno.dataSource.createQueryRunner();
      await conexion.startTransaction();
      try {
        await conexion.query('ALTER TABLE aud.evento_auditoria DISABLE TRIGGER evento_auditoria_solo_insercion');
        await conexion.query(sentencia, parametros);
        await conexion.query('ALTER TABLE aud.evento_auditoria ENABLE TRIGGER evento_auditoria_solo_insercion');
        await conexion.commitTransaction();
      } catch (error) {
        await conexion.rollbackTransaction();
        throw error;
      } finally {
        await conexion.release();
      }
    },
    /** event_type y payload de los eventos del outbox de esa verificación. */
    eventosDe: (verificacionId: string): Promise<{ event_type: string; payload: unknown }[]> =>
      entorno.dataSource.query('SELECT event_type, payload FROM sync.outbox WHERE aggregate_id = $1 ORDER BY seq', [verificacionId]),
    verificacionesDe: (tenantId: string): Promise<{ estado: string }[]> =>
      entorno.dataSource.query('SELECT estado FROM aud.verificacion_integridad WHERE tenant_id = $1 ORDER BY terminada_en', [tenantId]),
  };
}

async function agregar(entorno: EntornoAuditoria, tenantId: string, filas: number): Promise<void> {
  await entorno.dataSource.query(
    `INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, despues, ocurrido_en)
     SELECT gen_random_uuid(), $1, 'OPERACION', 'DIRECTO', 'rest.venta.anular', 'venta', 'V-' || serie, jsonb_build_object('total', serie), now()
       FROM generate_series(1, $2::int) AS serie`,
    [tenantId, filas],
  );
}
