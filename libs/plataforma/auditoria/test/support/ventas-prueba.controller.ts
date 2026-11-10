import { ConflictException, Controller, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { Auditable } from '../../src/interface/auditable.interceptor.js';

/** Tabla de negocio de prueba: muestra que el cambio y la auditoría confirman o se revierten juntos. */
export const CREAR_TABLA_VENTAS = `CREATE TABLE IF NOT EXISTS public.venta_prueba (id text PRIMARY KEY, estado text NOT NULL)`;
export const VENTA_QUE_FALLA = 'V-FALLA';
const ENTIDAD_TIPO_MAS_LARGA_QUE_LA_COLUMNA = 'x'.repeat(41);

/** Caso de uso de prueba sin uso real de @Auditable (el primero es el spec 25). El motivo del cuerpo lo lee el interceptor. */
@Controller('ventas')
export class VentasPruebaController {
  constructor(@Inject(TypeOrmUnitOfWork) private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @Auditable({ accion: 'rest.venta.anular', entidadTipo: 'venta', parametroId: 'id', enmascarar: ['tarjeta'] })
  anular(@Param('id') id: string) {
    return this.anularVenta(id);
  }

  /** La inserción de auditoría falla en la base (entidad_tipo de 41): la anulación no debe quedar. */
  @Post(':id/anular-sin-auditoria')
  @Auditable({ accion: 'rest.venta.anular', entidadTipo: ENTIDAD_TIPO_MAS_LARGA_QUE_LA_COLUMNA, parametroId: 'id' })
  anularSinAuditoria(@Param('id') id: string) {
    return this.anularVenta(id);
  }

  private anularVenta(id: string) {
    return this.unidadDeTrabajo.run(async () => {
      await this.unidadDeTrabajo.manager.query(`UPDATE public.venta_prueba SET estado = 'ANULADA' WHERE id = $1`, [id]);
      if (id === VENTA_QUE_FALLA) throw new ConflictException({ codigo: 'VENTA_CERRADA' });
      return { id, estado: 'ANULADA', tarjeta: '4111 1111 1111 1111' };
    });
  }
}
