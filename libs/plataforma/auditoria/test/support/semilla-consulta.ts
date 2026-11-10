import { uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { DataSource } from 'typeorm';

/** Columnas de aud.evento_auditoria que se siembran; numero y hashes los pone el trigger. */
export interface EventoSembrado {
  accion?: string;
  tipo?: 'OPERACION' | 'ACCESO_SENSIBLE';
  entidadTipo?: string;
  entidadId?: string;
  usuarioId?: string | null;
  sucursalId?: string | null;
  antes?: unknown;
  despues?: unknown;
  motivo?: string | null;
  personaTitularId?: string | null;
  finalidad?: string | null;
  ocurridoEn: string;
}

/** Inserta como superusuario (salta la RLS): datos de partida de las pruebas de consulta (spec 20b). */
export function crearSemilla(dataSource: DataSource) {
  let correlativo = 0;
  const consultar = (sql: string, parametros: unknown[] = []) => dataSource.query(sql, parametros);

  return {
    /** Tenant con una empresa; devuelve los dos ids. */
    async tenant(): Promise<{ tenantId: string; empresaId: string }> {
      const tenantId = uuidV7();
      const empresaId = uuidV7();
      correlativo += 1;
      await consultar(`INSERT INTO org.tenant (id, codigo, nombre, estado, version) VALUES ($1, $2, 'Sabores del Sur', 'ACTIVO', 1)`, [
        tenantId,
        `aud-${correlativo}-${tenantId.slice(-8)}`,
      ]);
      await consultar(`INSERT INTO org.empresa (id, tenant_id, ruc, razon_social, version) VALUES ($1, $2, $3, 'Sabores del Sur SAC', 1)`, [
        empresaId,
        tenantId,
        `20${String(correlativo).padStart(9, '0')}`,
      ]);
      return { tenantId, empresaId };
    },

    async sucursal(tenantId: string, empresaId: string, codigo: string, nombre: string): Promise<string> {
      const id = uuidV7();
      await consultar(`INSERT INTO org.sucursal (id, tenant_id, empresa_id, codigo, nombre, version) VALUES ($1, $2, $3, $4, $5, 1)`, [
        id,
        tenantId,
        empresaId,
        codigo,
        nombre,
      ]);
      return id;
    },

    /** Usuario con membresía ACTIVO en el tenant. */
    async persona(tenantId: string, nombre: string, correo: string): Promise<string> {
      const usuarioId = uuidV7();
      await consultar(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, $3, 'EXTERNO', 'ACTIVO')`, [usuarioId, correo, nombre]);
      await consultar(
        `INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, es_propietario, desde) VALUES ($1, $2, $3, 'ACTIVO', false, now() - interval '1 day')`,
        [uuidV7(), usuarioId, tenantId],
      );
      return usuarioId;
    },

    async evento(tenantId: string, evento: EventoSembrado): Promise<string> {
      const id = uuidV7();
      await consultar(
        `INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, usuario_id, sucursal_id, antes, despues,
                                           motivo, persona_titular_id, finalidad, ocurrido_en)
         VALUES ($1, $2, $3, 'DIRECTO', $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14)`,
        [
          id,
          tenantId,
          evento.tipo ?? 'OPERACION',
          evento.accion ?? 'rest.venta.anular',
          evento.entidadTipo ?? 'venta',
          evento.entidadId ?? `V-${id.slice(-6)}`,
          evento.usuarioId ?? null,
          evento.sucursalId ?? null,
          evento.antes === undefined ? null : JSON.stringify(evento.antes),
          evento.despues === undefined ? null : JSON.stringify(evento.despues),
          evento.motivo ?? null,
          evento.personaTitularId ?? null,
          evento.finalidad ?? null,
          evento.ocurridoEn,
        ],
      );
      return id;
    },
  };
}
