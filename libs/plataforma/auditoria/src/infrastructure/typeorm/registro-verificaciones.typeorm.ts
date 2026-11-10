import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { DataSource, SelectQueryBuilder } from 'typeorm';
import type { RegistroVerificaciones, TenantsConEventos } from '../../application/ports/registro-verificaciones.port.js';
import type { EstadoVerificacion, ModoVerificacion, MotivoRotura, PuntoDeControl, TramoVerificado, Verificacion } from '../../domain/verificacion.js';
import { VerificacionIntegridadEntidad, type FilaVerificacionIntegridad } from './entidades.js';

/** Fila de aud.verificar_cadena tal como la devuelve node-pg: bigint como texto. */
interface FilaTramo {
  ultimo_numero: string;
  ultimo_hash: string;
  filas: string;
  numero_roto: string | null;
  motivo: MotivoRotura | null;
}

const ESTADO_OK: EstadoVerificacion = 'OK';

/**
 * Historial con TypeORM. El recorrido de la cadena y el máximo número llaman a las funciones de
 * db/01g_aud_integridad.sql: SQL crudo justificado (regla 11), en TypeORM serían una consulta por fila.
 */
export class RegistroVerificacionesTypeOrm implements RegistroVerificaciones {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async ultimaCorrecta(): Promise<PuntoDeControl | null> {
    const fila = await this.masRecienteDelTenant().andWhere('verificacion.estado = :estado', { estado: ESTADO_OK }).getOne();
    return fila ? { numero: fila.hastaNumero, hash: fila.ultimoHash } : null;
  }

  async ultima(): Promise<Verificacion | null> {
    const fila = await this.masRecienteDelTenant().getOne();
    return fila ? verificacionDesdeFila(fila) : null;
  }

  async guardar(verificacion: Verificacion): Promise<void> {
    await this.unidadDeTrabajo.manager.createQueryBuilder().insert().into(VerificacionIntegridadEntidad).values(filaDesdeVerificacion(verificacion)).execute();
  }

  async verificarTramo(desde: PuntoDeControl, limite: number): Promise<TramoVerificado> {
    const [fila]: FilaTramo[] = await this.unidadDeTrabajo.manager.query(
      'SELECT ultimo_numero, ultimo_hash, filas, numero_roto, motivo FROM aud.verificar_cadena($1, $2, $3)',
      [desde.numero, desde.hash, limite],
    );
    return {
      ultimoNumero: fila.ultimo_numero,
      ultimoHash: fila.ultimo_hash,
      filas: Number(fila.filas),
      numeroRoto: fila.numero_roto,
      motivo: fila.motivo,
    };
  }

  async maximoNumero(): Promise<string> {
    const [fila]: { maximo: string }[] = await this.unidadDeTrabajo.manager.query('SELECT aud.maximo_numero() AS maximo');
    return String(fila.maximo);
  }

  /** Del más reciente al más antiguo, solo el primero. Filtra por tenant además de la RLS (regla 3). */
  private masRecienteDelTenant(): SelectQueryBuilder<FilaVerificacionIntegridad> {
    return this.unidadDeTrabajo.manager
      .getRepository(VerificacionIntegridadEntidad)
      .createQueryBuilder('verificacion')
      .where('verificacion.tenantId = :tenantId', { tenantId: this.contexto.current().tenantId })
      .orderBy('verificacion.terminadaEn', 'DESC')
      .limit(1);
  }
}

/** Fuera de toda transacción de tenant: la función es SECURITY DEFINER de aud_lector y solo devuelve ids. */
export class TenantsConEventosTypeOrm implements TenantsConEventos {
  constructor(private readonly dataSource: DataSource) {}

  async listar(): Promise<string[]> {
    const filas: { tenant_id: string }[] = await this.dataSource.query('SELECT aud.tenants_con_eventos() AS tenant_id');
    return filas.map((fila) => fila.tenant_id);
  }
}

function filaDesdeVerificacion(verificacion: Verificacion): FilaVerificacionIntegridad {
  return { ...verificacion, filas: String(verificacion.filas) };
}

function verificacionDesdeFila(fila: FilaVerificacionIntegridad): Verificacion {
  return {
    ...fila,
    modo: fila.modo as ModoVerificacion,
    estado: fila.estado as EstadoVerificacion,
    motivo: fila.motivo as MotivoRotura | null,
    filas: Number(fila.filas),
  };
}
