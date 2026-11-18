import { Component, computed, inject, signal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CargandoComponent, ChipEstadoComponent, type TonoEstado } from '@vitrina/shared/ui';
import type { CuotaActual } from '../../models/cuota-actual';
import { ETIQUETAS_ESTADO_CUOTA, MENSAJES_CONSUMO_IDENTIDAD, textoConsultas } from '../../models/mensajes-consumo-identidad';
import { TONOS_ESTADO_CUOTA } from '../../models/tonos-cuota';
import { CuotaActualCliente } from '../../services/cuota-actual.cliente';
import { estadoDeCuotaActual } from '../../utils/estado-cuota';
import { etiquetaPeriodo } from '../../utils/periodo';

const PORCENTAJE_MAXIMO = 100;

interface VistaConsumo {
  mes: string;
  plan: string;
  consultas: string;
  porcentaje: number;
  estado: string;
  clasesBarra: string;
  tonoEstado: TonoEstado;
}

/**
 * Consumo DNI/RUC del propio tenant en el Inicio de admin (spec 30, TR-RF-047). La pide al crearse: la app la
 * envuelve en `*siPermiso="'plat.identidad.cuota'"`, así que sin el permiso no hay petición. Un error no bloquea el Inicio.
 */
@Component({
  selector: 'vit-tarjeta-consumo-identidad',
  imports: [MatProgressBarModule, CargandoComponent, ChipEstadoComponent],
  templateUrl: './tarjeta-consumo-identidad.component.html',
  styleUrl: './tarjeta-consumo-identidad.component.css',
})
export class TarjetaConsumoIdentidadComponent {
  private readonly cuotaActual = inject(CuotaActualCliente);

  protected readonly mensajes = MENSAJES_CONSUMO_IDENTIDAD;
  protected readonly cargando = signal(true);
  protected readonly fallo = signal(false);
  private readonly cuota = signal<CuotaActual | null>(null);
  protected readonly vista = computed(() => {
    const cuota = this.cuota();
    return cuota && vistaDe(cuota);
  });

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.cuota.set(await this.cuotaActual.obtener());
    } catch {
      this.fallo.set(true);
    } finally {
      this.cargando.set(false);
    }
  }
}

function vistaDe(cuota: CuotaActual): VistaConsumo {
  const estado = estadoDeCuotaActual(cuota);
  const tonoEstado = TONOS_ESTADO_CUOTA[estado];
  return {
    mes: etiquetaPeriodo(cuota.periodo),
    plan: cuota.plan,
    consultas: textoConsultas(cuota.consumidas, cuota.incluidas),
    porcentaje: Math.min(cuota.porcentaje, PORCENTAJE_MAXIMO),
    estado: ETIQUETAS_ESTADO_CUOTA[estado],
    clasesBarra: `vit-barra-consumo vit-barra-${tonoEstado}`,
    tonoEstado,
  };
}
