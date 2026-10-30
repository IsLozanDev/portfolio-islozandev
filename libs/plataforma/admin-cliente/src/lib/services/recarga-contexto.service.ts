import { inject, Injectable } from '@angular/core';
import { SesionService } from '@vitrina/shared/auth';

/**
 * Tras un cambio de sucursales, recarga `mi-contexto` para que el selector del shell lo muestre sin cerrar
 * sesión (TR-CA-007). La caché de permisos (60 s, TR-RNF-101) puede retrasarlo; se acepta.
 */
@Injectable({ providedIn: 'root' })
export class RecargaContextoService {
  private readonly sesion = inject(SesionService);

  /** Si se inactivó la sucursal de trabajo, se recarga sin ella y el shell pide elegir otra. */
  async recargar(sucursalInactivadaId?: string): Promise<void> {
    const actual = this.sesion.sucursalId();
    const sucursalId = actual && actual !== sucursalInactivadaId ? actual : undefined;
    try {
      await this.sesion.cargarContexto(sucursalId, { omitirAvisoError: true });
    } catch {
      // El cambio ya se guardó; el selector se pone al día en la próxima carga del contexto.
    }
  }
}
