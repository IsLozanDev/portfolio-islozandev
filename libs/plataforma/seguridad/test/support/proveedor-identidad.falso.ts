import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { ProveedorIdentidad } from '../../src/application/ports/proveedor-identidad.port.js';
import { IdentidadNoDisponibleError } from '../../src/domain/errores.js';

export type LlamadaIdentidad = { tipo: 'invitar'; correo: string; nombre: string; redirectTo: string } | { tipo: 'enlace'; correo: string; redirectTo: string };

/**
 * Doble de Supabase Admin. Al invitar hace lo que hace el trigger de `auth.users`: inserta
 * `seg.usuario` (EXTERNO, ACTIVO) con un id nuevo. Con `fallar = true` simula Supabase caído.
 */
export class ProveedorIdentidadFalso implements ProveedorIdentidad {
  readonly llamadas: LlamadaIdentidad[] = [];
  fallar = false;

  constructor(private readonly dataSource?: DataSource) {}

  async invitar(correo: string, nombre: string, redirectTo: string): Promise<{ usuarioId: string }> {
    if (this.fallar) throw new IdentidadNoDisponibleError('falso');
    this.llamadas.push({ tipo: 'invitar', correo, nombre, redirectTo });
    const usuarioId = randomUUID();
    await this.dataSource?.query(`INSERT INTO seg.usuario (id, email, nombre, tipo, estado) VALUES ($1, $2, $3, 'EXTERNO', 'ACTIVO')`, [
      usuarioId,
      correo.toLowerCase(),
      nombre,
    ]);
    return { usuarioId };
  }

  async enviarEnlace(correo: string, redirectTo: string): Promise<void> {
    if (this.fallar) throw new IdentidadNoDisponibleError('falso');
    this.llamadas.push({ tipo: 'enlace', correo, redirectTo });
  }
}
