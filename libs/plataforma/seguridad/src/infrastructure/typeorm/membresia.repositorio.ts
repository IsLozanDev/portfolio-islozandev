import { ConflictError, type TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { DataSource } from 'typeorm';
import type {
  InvitacionResuelta,
  LimitesPlan,
  RepositorioInvitaciones,
  RepositorioMembresias,
  UsuariosIdentidad,
} from '../../application/ports/repositorios.js';
import { Invitacion } from '../../domain/invitacion.js';
import { Membresia, type EstadoMembresia } from '../../domain/membresia.js';
import { RepositorioBase } from './repositorio-base.js';

interface FilaMembresia {
  id: string;
  usuario_id: string;
  tenant_id: string;
  estado: EstadoMembresia;
  es_propietario: boolean;
  invitado_por: string | null;
  desde: Date;
  hasta: Date | null;
  motivo: string | null;
  cambiado_por: string | null;
  cambiado_en: Date | null;
  version: string;
}

const SELECT_MEMBRESIA = `
  SELECT id, usuario_id, tenant_id, estado, es_propietario, invitado_por, desde, hasta, motivo, cambiado_por, cambiado_en, version
    FROM seg.membresia`;

export class MembresiaRepositorioTypeOrm extends RepositorioBase<Membresia> implements RepositorioMembresias {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants, { membresia_usuario_id_tenant_id_key: 'El usuario ya tiene una membresía en el tenant' });
  }

  async buscar(id: string): Promise<Membresia | null> {
    const [f] = await this.consultar<FilaMembresia>(`${SELECT_MEMBRESIA} WHERE id = $1 AND tenant_id = $2`, [id, this.tenantId]);
    return f ? this.leido(aMembresia(f)) : null;
  }

  async deUsuario(usuarioId: string): Promise<Membresia | null> {
    const [f] = await this.consultar<FilaMembresia>(`${SELECT_MEMBRESIA} WHERE usuario_id = $1 AND tenant_id = $2`, [usuarioId, this.tenantId]);
    return f ? this.leido(aMembresia(f)) : null;
  }

  async guardar(m: Membresia): Promise<void> {
    await this.persistir(
      m,
      async () => {
        await this.consultar(
          `INSERT INTO seg.membresia (id, usuario_id, tenant_id, estado, es_propietario, invitado_por, desde, hasta, motivo,
             cambiado_por, cambiado_en, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [m.id, m.usuarioId, this.tenantId, m.estado, m.esPropietario, m.invitadoPor, m.desde, m.hasta, m.motivo, m.cambiadoPor, m.cambiadoEn, m.version],
        );
      },
      (previa) =>
        this.actualizarFilas(
          `UPDATE seg.membresia SET estado = $3, invitado_por = $4, desde = $5, hasta = $6, motivo = $7, cambiado_por = $8,
                  cambiado_en = $9, version = $10
            WHERE id = $1 AND tenant_id = $2 AND version = $11`,
          [m.id, this.tenantId, m.estado, m.invitadoPor, m.desde, m.hasta, m.motivo, m.cambiadoPor, m.cambiadoEn, m.version, previa],
        ),
    );
  }

  async propietariosActivosParaActualizar(): Promise<string[]> {
    const filas = await this.consultar<{ id: string }>(
      `SELECT id FROM seg.membresia
        WHERE tenant_id = $1 AND es_propietario AND estado = 'ACTIVO' AND (hasta IS NULL OR hasta > now())
        ORDER BY id FOR UPDATE`,
      [this.tenantId],
    );
    return filas.map((f) => f.id);
  }
}

function aMembresia(f: FilaMembresia): Membresia {
  return Membresia.reconstituir(f.id, Number(f.version), {
    usuarioId: f.usuario_id,
    tenantId: f.tenant_id,
    estado: f.estado,
    esPropietario: f.es_propietario,
    invitadoPor: f.invitado_por,
    desde: f.desde,
    hasta: f.hasta,
    motivo: f.motivo,
    cambiadoPor: f.cambiado_por,
    cambiadoEn: f.cambiado_en,
  });
}

interface FilaInvitacion {
  id: string;
  tenant_id: string;
  membresia_id: string;
  token_hash: string;
  expira_en: Date;
  usada_en: Date | null;
  anulada_en: Date | null;
  creada_por: string;
  creada_en: Date;
}

const SELECT_INVITACION = `
  SELECT id, tenant_id, membresia_id, token_hash, expira_en, usada_en, anulada_en, creada_por, creada_en
    FROM seg.invitacion`;

/**
 * La invitación no es un agregado versionado: una ya leída solo cambia `usada_en` o `anulada_en`, y
 * `ux_invitacion_pendiente` impide dos pendientes. `porToken` va fuera de UnitOfWork: todavía no
 * hay tenant en el contexto.
 */
export class InvitacionRepositorioTypeOrm extends RepositorioBase implements RepositorioInvitaciones {
  private readonly conocidas = new WeakSet<Invitacion>();

  constructor(
    uow: TypeOrmUnitOfWork,
    tenants: TenantContext,
    private readonly dataSource: DataSource,
  ) {
    super(uow, tenants, {
      ux_invitacion_pendiente: 'La membresía ya tiene una invitación pendiente',
      invitacion_token_hash_key: 'Token de invitación repetido',
    });
  }

  async buscar(id: string): Promise<Invitacion | null> {
    const [f] = await this.consultar<FilaInvitacion>(`${SELECT_INVITACION} WHERE id = $1 AND tenant_id = $2`, [id, this.tenantId]);
    return f ? this.marcar(aInvitacion(f)) : null;
  }

  async pendienteDe(membresiaId: string): Promise<Invitacion | null> {
    const [f] = await this.consultar<FilaInvitacion>(
      `${SELECT_INVITACION} WHERE membresia_id = $1 AND tenant_id = $2 AND usada_en IS NULL AND anulada_en IS NULL`,
      [membresiaId, this.tenantId],
    );
    return f ? this.marcar(aInvitacion(f)) : null;
  }

  async guardar(i: Invitacion): Promise<void> {
    if (!this.conocidas.has(i)) {
      await this.consultar(
        `INSERT INTO seg.invitacion (id, tenant_id, membresia_id, token_hash, expira_en, usada_en, anulada_en, creada_por, creada_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [i.id, this.tenantId, i.membresiaId, i.tokenHash, i.expiraEn, i.usadaEn, i.anuladaEn, i.creadaPor, i.creadaEn],
      );
      this.conocidas.add(i);
      return;
    }
    const n = await this.actualizarFilas('UPDATE seg.invitacion SET usada_en = $3, anulada_en = $4 WHERE id = $1 AND tenant_id = $2', [
      i.id,
      this.tenantId,
      i.usadaEn,
      i.anuladaEn,
    ]);
    if (n === 0) throw new ConflictError('La invitación no existe en el tenant');
  }

  async porToken(tokenHash: string): Promise<InvitacionResuelta | null> {
    const [f] = await this.dataSource.query(
      `SELECT invitacion_id, tenant_id, membresia_id, usuario_id, tenant_nombre, expira_en, usada_en, anulada_en
         FROM seg.invitacion_por_token($1)`,
      [tokenHash],
    );
    if (!f) return null;
    return {
      invitacionId: f.invitacion_id,
      tenantId: f.tenant_id,
      membresiaId: f.membresia_id,
      usuarioId: f.usuario_id,
      tenantNombre: f.tenant_nombre,
      expiraEn: f.expira_en,
      usadaEn: f.usada_en,
      anuladaEn: f.anulada_en,
    };
  }

  private marcar(i: Invitacion): Invitacion {
    this.conocidas.add(i);
    return i;
  }
}

function aInvitacion(f: FilaInvitacion): Invitacion {
  return Invitacion.reconstituir(f.id, {
    tenantId: f.tenant_id,
    membresiaId: f.membresia_id,
    tokenHash: f.token_hash,
    expiraEn: f.expira_en,
    usadaEn: f.usada_en,
    anuladaEn: f.anulada_en,
    creadaPor: f.creada_por,
    creadaEn: f.creada_en,
  });
}

/** `seg.usuario` es global (sin RLS ni tenant); corre en la transacción del caso de uso. */
export class UsuariosIdentidadTypeOrm extends RepositorioBase implements UsuariosIdentidad {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async porCorreo(correo: string): Promise<{ id: string; nombre: string; tipo: string } | null> {
    const [f] = await this.consultar<{ id: string; nombre: string; tipo: string }>('SELECT id, nombre, tipo FROM seg.usuario WHERE email = $1', [
      correo.trim().toLowerCase(),
    ]);
    return f ?? null;
  }

  async marcarInterno(usuarioId: string): Promise<void> {
    await this.consultar(`UPDATE seg.usuario SET tipo = 'INTERNO' WHERE id = $1`, [usuarioId]);
  }

  async fijarTenantPreferido(usuarioId: string, tenantId: string): Promise<void> {
    await this.consultar('UPDATE seg.usuario SET tenant_preferido = $2 WHERE id = $1', [usuarioId, tenantId]);
  }
}

/** Lee org.suscripcion con SQL, como ProductosContratados: seguridad no importa la lib org. */
export class LimitesPlanTypeOrm extends RepositorioBase implements LimitesPlan {
  constructor(uow: TypeOrmUnitOfWork, tenants: TenantContext) {
    super(uow, tenants);
  }

  async limite(producto: string): Promise<number | null> {
    const [f] = await this.consultar<{ limite_usuarios: number | null }>(
      `SELECT limite_usuarios FROM org.suscripcion
        WHERE tenant_id = $1 AND producto_codigo = $2 AND estado IN ('PRUEBA', 'ACTIVA')
          AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)`,
      [this.tenantId, producto],
    );
    return f?.limite_usuarios ?? null;
  }

  async usados(producto: string, ahora: Date, excluirUsuarioId?: string): Promise<number> {
    const [{ n }] = await this.consultar<{ n: number }>(
      `SELECT count(DISTINCT m.usuario_id)::int AS n
         FROM seg.membresia m
         JOIN seg.asignacion a ON a.tenant_id = m.tenant_id AND a.membresia_id = m.id
        WHERE m.tenant_id = $1
          AND m.usuario_id IS DISTINCT FROM $4::uuid
          AND (m.estado = 'ACTIVO'
               OR (m.estado = 'INVITADO' AND EXISTS (
                     SELECT 1 FROM seg.invitacion i
                      WHERE i.tenant_id = m.tenant_id AND i.membresia_id = m.id
                        AND i.usada_en IS NULL AND i.anulada_en IS NULL AND i.expira_en > $3)))
          AND a.revocada_en IS NULL
          AND current_date BETWEEN a.vigente_desde AND COALESCE(a.vigente_hasta, 'infinity'::date)
          AND EXISTS (
                SELECT 1 FROM seg.rol r
                 WHERE r.producto_codigo = $2
                   AND (r.id = a.rol_id
                        OR r.id IN (SELECT pr.rol_id FROM seg.perfil_rol pr WHERE pr.perfil_id = a.perfil_id)))`,
      [this.tenantId, producto, ahora, excluirUsuarioId ?? null],
    );
    return n;
  }
}
