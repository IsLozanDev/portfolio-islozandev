import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { LectorItems } from './lector-items.js';
import type { CatalogoPort, ResultadoValidacion } from './ports/catalogo.port.js';

export interface DependenciasValidarItem {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  lector: LectorItems;
}

const INEXISTENTE: ResultadoValidacion = { valido: false, motivo: 'INEXISTENTE', atributos: null };

/**
 * TR-RF-027: ¿el código es válido hoy para el tenant del contexto? Mismas versiones y caché que
 * ConsultarItems. Puerto interno: no evalúa permiso. Reutiliza la transacción activa del llamador si la hay.
 */
export class ValidarItem implements CatalogoPort {
  constructor(private readonly dependencias: DependenciasValidarItem) {}

  validarItem(catalogo: string, codigo: string): Promise<ResultadoValidacion> {
    const { unidadDeTrabajo, contexto, lector } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const tenantId = contexto.current().tenantId;
      const versiones = await lector.versiones(catalogo, tenantId);
      const { visibles, noVisibles } = await lector.items(catalogo, tenantId, versiones, lector.fechaDeHoy());

      const visible = visibles.find((item) => item.codigo === codigo);
      if (visible) return { valido: true, motivo: null, atributos: visible.atributos };
      const noVisible = noVisibles[codigo];
      if (noVisible) return { valido: false, motivo: noVisible.motivo, atributos: noVisible.atributos };
      return INEXISTENTE;
    });
  }
}
