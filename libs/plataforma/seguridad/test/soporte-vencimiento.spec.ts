import { SystemClock } from '@vitrina/plataforma/kernel-infra';
import type { VencerAccesosSoporte } from '../src/application/vencer-accesos-soporte.js';
import { crearVencerAccesosSoporte } from '../src/infrastructure/typeorm/vencimiento-soporte.fabrica.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

/** El vencimiento que corre el worker cada minuto (spec 18), contra la base real. */
describeConDb('VencerAccesosSoporte (spec 18, PostgreSQL 16)', () => {
  let e: Entorno;
  let vencer: VencerAccesosSoporte;
  const avisos: Record<string, unknown>[] = [];
  let tenantA: string;
  let tenantB: string;
  let rolSoporte: string;

  const acceso = async (accesoId: string) =>
    (await e.dataSource.query('SELECT estado, causa_cierre, cerrado_por FROM seg.acceso_soporte WHERE id = $1', [accesoId]))[0];
  const membresia = async (membresiaId: string) =>
    (await e.dataSource.query('SELECT estado, cambiado_por, motivo FROM seg.membresia WHERE id = $1', [membresiaId]))[0];
  const asignacion = async (asignacionId: string) =>
    (await e.dataSource.query('SELECT revocada_por, motivo_revocacion, revocada_en FROM seg.asignacion WHERE id = $1', [asignacionId]))[0];
  const expirados = async (tenantId: string) =>
    (
      await e.dataSource.query(
        `SELECT usuario_id, detalle FROM seg.evento_seguridad WHERE tenant_id = $1 AND detalle ->> 'accion' = 'EXPIRADO' ORDER BY id`,
        [tenantId],
      )
    ).map((fila: { usuario_id: string | null; detalle: Record<string, unknown> }) => [fila.usuario_id, fila.detalle.acceso_id, fila.detalle.estado_anterior]);

  /** Agente con acceso APROBADO de 2 h que empezó hace 3 h: venció hace 1 h. */
  async function aprobadoVencido(tenantId: string, ticket: string): Promise<{ accesoId: string; membresiaId: string; asignacionId: string }> {
    const agente = await e.sembrar.membresia(await e.sembrar.tenant(), 'ACTIVO');
    const membresiaId = e.ids.next();
    await e.dataSource.query(
      `INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, desde, hasta) VALUES ($1, $2, $3, 'ACTIVO', now() - interval '3 hours', now() - interval '1 hour')`,
      [membresiaId, agente.usuarioId, tenantId],
    );
    const asignacionId = await e.sembrar.asignacion(tenantId, membresiaId, { rolId: rolSoporte });
    const accesoId = e.ids.next();
    await e.dataSource.query(
      `INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado, solicitado_en, caduca_en,
                                       aprobado_por, horas_aprobadas, desde, hasta, membresia_id, asignacion_id)
       VALUES ($1, $2, $3, $4, 'Revisar series de boletas', 'LECTURA', 2, 'APROBADO', now() - interval '4 hours', now() + interval '20 hours',
               $3, 2, now() - interval '3 hours', now() - interval '1 hour', $5, $6)`,
      [accesoId, tenantId, agente.usuarioId, ticket, membresiaId, asignacionId],
    );
    return { accesoId, membresiaId, asignacionId };
  }

  /** Solicitud pendiente de hace 25 h. */
  async function pendienteCaducada(tenantId: string, ticket: string): Promise<string> {
    const agente = await e.sembrar.membresia(await e.sembrar.tenant(), 'ACTIVO');
    const accesoId = e.ids.next();
    await e.dataSource.query(
      `INSERT INTO seg.acceso_soporte (id, tenant_id, agente_id, ticket, motivo, modo, horas_solicitadas, estado, solicitado_en, caduca_en)
       VALUES ($1, $2, $3, $4, 'Error al emitir factura', 'ESCRITURA', 1, 'PENDIENTE', now() - interval '25 hours', now() - interval '1 hour')`,
      [accesoId, tenantId, agente.usuarioId, ticket],
    );
    return accesoId;
  }

  beforeAll(async () => {
    e = await crearEntorno();
    vencer = crearVencerAccesosSoporte({
      unidadDeTrabajo: e.uow,
      contexto: e.contexto,
      reloj: new SystemClock(),
      eventos: e.eventos,
      dataSource: e.dataSource,
      avisar: (_mensaje, datos) => void avisos.push(datos),
    });
    await e.sembrar.permiso('plat.seguridad.bitacora', { alcanceMinimo: 'TENANT' });
    tenantA = await e.sembrar.tenant();
    tenantB = await e.sembrar.tenant();
    rolSoporte = await e.sembrar.rol(null, 'PLAT', 'SOPORTE_VENC', ['plat.seguridad.bitacora']);
  });

  afterAll(() => e?.cerrar());

  it('vence el aprobado (membresía FINALIZADO, asignación revocada, sin actor) y caduca la pendiente de 24 h', async () => {
    const aprobado = await aprobadoVencido(tenantA, 'SOP-000245');
    const caducada = await pendienteCaducada(tenantA, 'SOP-000300');
    const [{ version: vtAntes }] = await e.dataSource.query('SELECT version FROM seg.version_seguridad WHERE tenant_id = $1', [tenantA]);

    expect(await vencer.ejecutar()).toEqual({ vencidos: 2, fallidos: 0 });

    expect(await acceso(aprobado.accesoId)).toEqual({ estado: 'EXPIRADO', causa_cierre: 'VENCIMIENTO', cerrado_por: null });
    expect(await acceso(caducada)).toEqual({ estado: 'EXPIRADO', causa_cierre: 'VENCIMIENTO', cerrado_por: null });
    expect(await membresia(aprobado.membresiaId)).toEqual({ estado: 'FINALIZADO', cambiado_por: null, motivo: 'Acceso de soporte vencido' });
    expect(await asignacion(aprobado.asignacionId)).toMatchObject({ revocada_por: null, motivo_revocacion: 'Acceso de soporte vencido' });
    const [{ version: vtDespues }] = await e.dataSource.query('SELECT version FROM seg.version_seguridad WHERE tenant_id = $1', [tenantA]);
    expect(Number(vtDespues)).toBeGreaterThan(Number(vtAntes));
    expect(await expirados(tenantA)).toEqual(
      expect.arrayContaining([
        [null, aprobado.accesoId, 'APROBADO'],
        [null, caducada, 'PENDIENTE'],
      ]),
    );
    expect(await e.eventosDe(aprobado.accesoId)).toEqual([['soporte.expirado', expect.any(Number)]]);
    expect((await e.eventosDe(aprobado.membresiaId)).map(([tipo]) => tipo)).toEqual(['membresia.finalizada']);
  });

  it('es idempotente: la segunda corrida no encuentra nada', async () => {
    expect(await vencer.ejecutar()).toEqual({ vencidos: 0, fallidos: 0 });
  });

  it('un acceso que falla no frena a los demás y queda en el aviso con ids, sin datos personales', async () => {
    const queFalla = await aprobadoVencido(tenantB, 'SOP-000400');
    const queVence = await aprobadoVencido(tenantA, 'SOP-000401');
    await e.dataSource.query(
      `ALTER TABLE seg.evento_seguridad ADD CONSTRAINT ck_prueba_falla_b CHECK (tenant_id IS DISTINCT FROM '${tenantB}' OR detalle ->> 'accion' IS DISTINCT FROM 'EXPIRADO') NOT VALID`,
    );
    try {
      expect(await vencer.ejecutar()).toEqual({ vencidos: 1, fallidos: 1 });
    } finally {
      await e.dataSource.query('ALTER TABLE seg.evento_seguridad DROP CONSTRAINT ck_prueba_falla_b');
    }

    expect((await acceso(queVence.accesoId)).estado).toBe('EXPIRADO');
    // La transacción del que falló se revirtió entera: sigue APROBADO para la próxima corrida.
    expect((await acceso(queFalla.accesoId)).estado).toBe('APROBADO');
    expect((await membresia(queFalla.membresiaId)).estado).toBe('ACTIVO');
    expect(avisos.at(-1)).toEqual({ evento: 'seg.soporte.vencimiento_falla', acceso_id: queFalla.accesoId, tenant_id: tenantB, error: expect.any(String) });

    expect(await vencer.ejecutar()).toEqual({ vencidos: 1, fallidos: 0 });
    expect((await acceso(queFalla.accesoId)).estado).toBe('EXPIRADO');
  });
});
