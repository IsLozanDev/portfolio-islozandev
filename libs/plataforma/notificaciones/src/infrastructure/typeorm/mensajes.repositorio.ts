import type { TenantContext } from '@vitrina/plataforma/kernel';
import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EntityManager } from 'typeorm';
import type { RepositorioMensajes } from '../../application/ports/repositorios.js';
import { MensajeModificadoError } from '../../domain/errores.js';
import type { IntentoEntrega } from '../../domain/intento-entrega.js';
import type { Mensaje } from '../../domain/mensaje.js';
import { IntentoEntregaEntidad, MensajeEntidad } from './entidades.js';
import { cambiosDeMensaje, filaDesdeIntento, filaDesdeMensaje, mensajeDesdeFila } from './mapeo.js';

const PRIMER_NUMERO = 1;

/** ntf.mensaje y ntf.intento_entrega sobre el EntityManager activo. Filtra por el tenant además de la RLS (regla 3). */
export class RepositorioMensajesTypeOrm implements RepositorioMensajes {
  constructor(
    private readonly unidadDeTrabajo: TypeOrmUnitOfWork,
    private readonly contexto: TenantContext,
  ) {}

  async porClave(claveIdempotencia: string): Promise<Mensaje | null> {
    const fila = await this.manager.getRepository(MensajeEntidad).findOneBy({ tenantId: this.tenantId, claveIdempotencia });
    return fila ? mensajeDesdeFila(fila) : null;
  }

  async obtener(mensajeId: string): Promise<Mensaje | null> {
    const fila = await this.manager.getRepository(MensajeEntidad).findOneBy({ id: mensajeId, tenantId: this.tenantId });
    return fila ? mensajeDesdeFila(fila) : null;
  }

  /**
   * `ON CONFLICT DO NOTHING`: con dos envíos concurrentes de la misma clave, el segundo espera al primero en el
   * índice único y no inserta. Se relee por la clave y se devuelve el que quedó.
   */
  async insertar(mensaje: Mensaje): Promise<Mensaje> {
    await this.manager.createQueryBuilder().insert().into(MensajeEntidad).values(filaDesdeMensaje(mensaje)).orIgnore().updateEntity(false).execute();
    const guardado = await this.porClave(mensaje.instantanea().claveIdempotencia);
    return guardado ?? mensaje;
  }

  /** La columna de versión sube sola en el UPDATE; el filtro por la versión leída es el bloqueo optimista. */
  async actualizar(mensaje: Mensaje, versionEsperada: number): Promise<void> {
    const resultado = await this.manager
      .getRepository(MensajeEntidad)
      .update({ id: mensaje.id, tenantId: this.tenantId, version: versionEsperada }, cambiosDeMensaje(mensaje));
    if (resultado.affected !== 1) throw new MensajeModificadoError();
  }

  async ultimoDestino(destinoHash: string): Promise<string | null> {
    const fila = await this.manager
      .getRepository(MensajeEntidad)
      .findOne({ select: { destino: true }, where: { tenantId: this.tenantId, destinoHash }, order: { creadoEn: 'DESC' } });
    return fila?.destino ?? null;
  }

  async registrarIntento(intento: IntentoEntrega): Promise<void> {
    await this.manager.getRepository(IntentoEntregaEntidad).insert(filaDesdeIntento(intento));
  }

  async siguienteNumeroIntento(mensajeId: string): Promise<number> {
    const registrados = await this.manager.getRepository(IntentoEntregaEntidad).countBy({ mensajeId, tenantId: this.tenantId });
    return registrados + PRIMER_NUMERO;
  }

  private get manager(): EntityManager {
    return this.unidadDeTrabajo.manager;
  }

  private get tenantId(): string {
    return this.contexto.current().tenantId;
  }
}
