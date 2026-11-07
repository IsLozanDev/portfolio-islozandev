import type { TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import type { EscrituraImportacion, TipoLote } from '../../application/ports/importacion.js';

// SQL crudo (regla 11): escritura por lotes desde el jsonb de operaciones con el catálogo bloqueado, en
// funciones SECURITY DEFINER de cat_editor. TypeORM no lo expresa sin traer miles de entidades a memoria.
const INICIAR = 'SELECT cat.iniciar_importacion($1) AS iniciada';
const APLICAR_LOTE = 'SELECT cat.aplicar_lote_importacion($1, $2, $3, $4) AS escritas';
const CERRAR_BAJAS = 'SELECT cat.cerrar_bajas_importacion($1) AS cerradas';
const FINALIZAR = 'SELECT cat.finalizar_importacion($1, $2) AS version';

export class EscrituraImportacionTypeOrm implements EscrituraImportacion {
  constructor(private readonly unidadDeTrabajo: TypeOrmUnitOfWork) {}

  async iniciar(importacionId: string): Promise<boolean> {
    const [{ iniciada }] = await this.unidadDeTrabajo.manager.query(INICIAR, [importacionId]);
    return iniciada === true;
  }

  async aplicarLote(importacionId: string, tipo: TipoLote, desde: number, hasta: number): Promise<number> {
    const [{ escritas }] = await this.unidadDeTrabajo.manager.query(APLICAR_LOTE, [importacionId, tipo, desde, hasta]);
    return Number(escritas);
  }

  async cerrarBajas(importacionId: string): Promise<number> {
    const [{ cerradas }] = await this.unidadDeTrabajo.manager.query(CERRAR_BAJAS, [importacionId]);
    return Number(cerradas);
  }

  /** bigint: node-pg lo devuelve como string. */
  async finalizar(importacionId: string, por: string): Promise<number> {
    const [{ version }] = await this.unidadDeTrabajo.manager.query(FINALIZAR, [importacionId, por]);
    return Number(version);
  }
}
