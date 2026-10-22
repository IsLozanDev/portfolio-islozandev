import type { IdGenerator } from '@vitrina/plataforma/kernel';
import type { DataSource, EntityManager } from 'typeorm';
import type { RepositorioManifiestos, SesionManifiesto } from '../../application/ports/repositorios.js';
import type { CambiosManifiesto, CatalogoProducto, Manifiesto, OpcionManifiesto, ResumenCambios } from '../../domain/manifiesto.js';

/**
 * Corre con la conexión de migración (dueña de las tablas): escribe el catálogo global y los roles
 * predefinidos (tenant_id nulo), que la RLS de la aplicación no deja escribir.
 */
export class ManifiestoRepositorioTypeOrm implements RepositorioManifiestos {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ids: IdGenerator,
  ) {}

  transaccion<T>(trabajo: (sesion: SesionManifiesto) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((manager) => trabajo(new Sesion(manager, this.ids)));
  }
}

class Sesion implements SesionManifiesto {
  constructor(
    private readonly m: EntityManager,
    private readonly ids: IdGenerator,
  ) {}

  private q<F = unknown>(sql: string, params: unknown[] = []): Promise<F[]> {
    return this.m.query(sql, params);
  }

  async catalogoActual(producto: string): Promise<CatalogoProducto> {
    const [vigente] = await this.q<{ version: string; hash: string }>(
      'SELECT version, hash FROM seg.manifiesto_aplicado WHERE producto_codigo = $1 ORDER BY id DESC LIMIT 1',
      [producto],
    );
    const modulos = await this.q<CatalogoProducto['modulos'][number]>(
      'SELECT codigo, nombre, orden, obsoleto FROM seg.modulo WHERE producto_codigo = $1',
      [producto],
    );
    const opciones = await this.q<CatalogoProducto['opciones'][number]>(
      `SELECT o.codigo, m.codigo AS modulo, p.codigo AS padre, o.nombre, o.ruta, o.icono, o.orden, o.obsoleto,
              ARRAY(SELECT op.permiso_codigo::text FROM seg.opcion_permiso op WHERE op.opcion_id = o.id ORDER BY 1) AS permisos
         FROM seg.opcion o
         JOIN seg.modulo m ON m.id = o.modulo_id
         LEFT JOIN seg.opcion p ON p.id = o.padre_id
        WHERE m.producto_codigo = $1`,
      [producto],
    );
    const permisos = await this.q<CatalogoProducto['permisos'][number]>(
      `SELECT codigo, descripcion, alcance_minimo AS "alcanceMinimo", sensible, obsoleto FROM seg.permiso WHERE producto_codigo = $1`,
      [producto],
    );
    const roles = await this.q<CatalogoProducto['roles'][number]>(
      `SELECT r.codigo, r.nombre, r.obsoleto,
              ARRAY(SELECT rp.permiso_codigo::text FROM seg.rol_permiso rp WHERE rp.rol_id = r.id ORDER BY 1) AS permisos
         FROM seg.rol r
        WHERE r.tenant_id IS NULL AND r.producto_codigo = $1`,
      [producto],
    );
    return { vigente: vigente ?? null, modulos, opciones, permisos, roles };
  }

  /** Orden por las FK: producto, módulos y permisos antes que opciones y roles. */
  async aplicar(manifiesto: Manifiesto, c: CambiosManifiesto, registro: { hash: string; resumen: ResumenCambios }): Promise<void> {
    const producto = manifiesto.productoCodigo;
    await this.q('INSERT INTO seg.producto (codigo, nombre) VALUES ($1, $2) ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre', [
      producto,
      manifiesto.nombre,
    ]);

    for (const mo of c.modulos.insertados) {
      await this.q('INSERT INTO seg.modulo (id, producto_codigo, codigo, nombre, orden) VALUES ($1, $2, $3, $4, $5)', [
        this.ids.next(),
        producto,
        mo.codigo,
        mo.nombre,
        mo.orden,
      ]);
    }
    for (const mo of c.modulos.actualizados) {
      await this.q('UPDATE seg.modulo SET nombre = $3, orden = $4, obsoleto = false WHERE producto_codigo = $1 AND codigo = $2', [
        producto,
        mo.codigo,
        mo.nombre,
        mo.orden,
      ]);
    }
    await this.q('UPDATE seg.modulo SET obsoleto = true WHERE producto_codigo = $1 AND codigo = ANY($2::varchar[])', [producto, c.modulos.obsoletos]);

    for (const p of c.permisos.insertados) {
      await this.q('INSERT INTO seg.permiso (codigo, producto_codigo, descripcion, alcance_minimo, sensible) VALUES ($1, $2, $3, $4, $5)', [
        p.codigo,
        producto,
        p.descripcion,
        p.alcanceMinimo,
        p.sensible,
      ]);
    }
    for (const p of c.permisos.actualizados) {
      await this.q(
        'UPDATE seg.permiso SET descripcion = $3, alcance_minimo = $4, sensible = $5, obsoleto = false WHERE producto_codigo = $1 AND codigo = $2',
        [producto, p.codigo, p.descripcion, p.alcanceMinimo, p.sensible],
      );
    }
    await this.q('UPDATE seg.permiso SET obsoleto = true WHERE producto_codigo = $1 AND codigo = ANY($2::varchar[])', [producto, c.permisos.obsoletos]);

    await this.aplicarOpciones(producto, c.opciones);
    await this.aplicarRoles(producto, c.roles);

    await this.q('INSERT INTO seg.manifiesto_aplicado (producto_codigo, version, hash, cambios) VALUES ($1, $2, $3, $4::jsonb)', [
      producto,
      manifiesto.version,
      registro.hash,
      JSON.stringify(registro.resumen),
    ]);
  }

  /** El padre se fija al final: puede ser una opción insertada en esta misma aplicación. */
  private async aplicarOpciones(producto: string, c: CambiosManifiesto['opciones']): Promise<void> {
    const moduloId = '(SELECT id FROM seg.modulo WHERE producto_codigo = $2 AND codigo = $3)';
    for (const o of c.insertados) {
      await this.q(
        `INSERT INTO seg.opcion (id, modulo_id, codigo, nombre, ruta, icono, orden) VALUES ($1, ${moduloId}, $4, $5, $6, $7, $8)`,
        [this.ids.next(), producto, o.modulo, o.codigo, o.nombre, o.ruta, o.icono, o.orden],
      );
    }
    for (const o of c.actualizados) {
      await this.q(
        `UPDATE seg.opcion SET modulo_id = ${moduloId}, nombre = $4, ruta = $5, icono = $6, orden = $7, obsoleto = false WHERE codigo = $1`,
        [o.codigo, producto, o.modulo, o.nombre, o.ruta, o.icono, o.orden],
      );
    }
    const tocadas: OpcionManifiesto[] = [...c.insertados, ...c.actualizados];
    for (const o of tocadas) {
      await this.q('UPDATE seg.opcion SET padre_id = (SELECT id FROM seg.opcion WHERE codigo = $2) WHERE codigo = $1', [o.codigo, o.padre]);
      await this.q('DELETE FROM seg.opcion_permiso WHERE opcion_id = (SELECT id FROM seg.opcion WHERE codigo = $1)', [o.codigo]);
      await this.q(
        'INSERT INTO seg.opcion_permiso (opcion_id, permiso_codigo) SELECT (SELECT id FROM seg.opcion WHERE codigo = $1), unnest($2::varchar[])',
        [o.codigo, o.permisos],
      );
    }
    await this.q(
      `UPDATE seg.opcion o SET obsoleto = true FROM seg.modulo m
        WHERE m.id = o.modulo_id AND m.producto_codigo = $1 AND o.codigo = ANY($2::varchar[])`,
      [producto, c.obsoletos],
    );
  }

  /** Roles predefinidos: tenant_id nulo y no editables. Sus permisos se reemplazan completos. */
  private async aplicarRoles(producto: string, c: CambiosManifiesto['roles']): Promise<void> {
    const rolId = '(SELECT id FROM seg.rol WHERE tenant_id IS NULL AND producto_codigo = $1 AND codigo = $2)';
    for (const r of c.insertados) {
      await this.q('INSERT INTO seg.rol (id, tenant_id, producto_codigo, codigo, nombre, editable) VALUES ($1, NULL, $2, $3, $4, false)', [
        this.ids.next(),
        producto,
        r.codigo,
        r.nombre,
      ]);
    }
    for (const r of c.actualizados) {
      await this.q('UPDATE seg.rol SET nombre = $3, obsoleto = false WHERE tenant_id IS NULL AND producto_codigo = $1 AND codigo = $2', [
        producto,
        r.codigo,
        r.nombre,
      ]);
    }
    for (const r of [...c.insertados, ...c.actualizados]) {
      await this.q(`DELETE FROM seg.rol_permiso WHERE rol_id = ${rolId}`, [producto, r.codigo]);
      await this.q(`INSERT INTO seg.rol_permiso (rol_id, permiso_codigo) SELECT ${rolId}, unnest($3::varchar[])`, [producto, r.codigo, r.permisos]);
    }
    await this.q('UPDATE seg.rol SET obsoleto = true WHERE tenant_id IS NULL AND producto_codigo = $1 AND codigo = ANY($2::varchar[])', [
      producto,
      c.obsoletos,
    ]);
  }
}
