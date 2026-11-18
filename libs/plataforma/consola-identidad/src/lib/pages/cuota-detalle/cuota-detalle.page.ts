import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AvisosService, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, PanelLateralService } from '@vitrina/shared/ui';
import { BarraConsumoComponent } from '../../components/barra-consumo/barra-consumo.component';
import {
  PanelAjusteCuotaComponent,
  type DatosPanelAjusteCuota,
  type ResultadoPanelAjusteCuota,
} from '../../components/panel-ajuste-cuota/panel-ajuste-cuota.component';
import { RESULTADOS_CONSULTA, type DetalleCuota } from '../../models/cuota';
import { aErrorIdentidad, CODIGO_OPERADOR_REQUERIDO, type ErrorIdentidad } from '../../models/error-identidad';
import {
  ETIQUETAS_ESTADO_CUOTA,
  ETIQUETAS_RESULTADO_CONSULTA,
  MENSAJES_CUOTAS,
  MENSAJES_DETALLE_CUOTA,
  MENSAJES_POR_CODIGO,
  textoAvisoEnviado,
  textoConsumo,
  textoSinCuotaDelTenant,
} from '../../models/mensajes-identidad';
import { TONOS_ESTADO_CUOTA } from '../../models/tonos';
import { CuotasCliente } from '../../services/cuotas.cliente';
import { estadoDeFila } from '../../utils/estado-cuota';
import { PARAMETRO_URL } from '../../utils/filtro-url';
import { formatearFechaHora } from '../../utils/formato';
import { esPeriodoActual, etiquetaPeriodo } from '../../utils/periodo';

const CODIGO_CUOTA_NO_ENCONTRADA = 'CUOTA_NO_ENCONTRADA';

interface FilaConsultas {
  etiqueta: string;
  cantidad: number;
}

/** Detalle de la cuota de un tenant en un mes (spec 30; pantalla tipo «Detalle»). Solo el mes actual se ajusta. */
@Component({
  selector: 'vit-cuota-detalle',
  imports: [MatButtonModule, MatIconModule, RouterLink, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, BarraConsumoComponent],
  templateUrl: './cuota-detalle.page.html',
})
export class CuotaDetallePage {
  private readonly cuotas = inject(CuotasCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);
  private readonly parametros = inject(ActivatedRoute).snapshot.paramMap;

  protected readonly mensajes = MENSAJES_DETALLE_CUOTA;
  protected readonly mensajeSoloOperador = MENSAJES_POR_CODIGO[CODIGO_OPERADOR_REQUERIDO];
  protected readonly tenantId = this.parametros.get('tenantId') ?? '';
  protected readonly periodo = this.parametros.get('periodo') ?? '';
  protected readonly etiquetaMes = etiquetaPeriodo(this.periodo);
  protected readonly volverParametros = { [PARAMETRO_URL.periodo]: this.periodo };
  protected readonly textoSinCuota = textoSinCuotaDelTenant(this.etiquetaMes);
  protected readonly ajustable = esPeriodoActual(this.periodo, new Date());

  protected readonly detalle = signal<DetalleCuota | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<ErrorIdentidad | null>(null);
  protected readonly soloOperador = computed(() => this.error()?.codigo === CODIGO_OPERADOR_REQUERIDO);
  protected readonly sinCuota = computed(() => this.error()?.codigo === CODIGO_CUOTA_NO_ENCONTRADA);

  protected readonly estado = computed(() => {
    const detalle = this.detalle();
    return detalle && estadoDeFila(detalle);
  });
  protected readonly textoEstado = computed(() => {
    const estado = this.estado();
    return estado ? ETIQUETAS_ESTADO_CUOTA[estado] : '';
  });
  protected readonly tonoEstado = computed(() => {
    const estado = this.estado();
    return estado ? TONOS_ESTADO_CUOTA[estado] : 'neutro';
  });
  protected readonly consumo = computed(() => {
    const detalle = this.detalle();
    return detalle ? textoConsumo(detalle.consumidas, detalle.incluidas, detalle.porcentaje) : '';
  });
  protected readonly etiquetaBarra = computed(() => `${MENSAJES_CUOTAS.consumoDe} ${this.detalle()?.tenantNombre ?? ''}`);
  protected readonly avisoUmbral = computed(() => textoDeAviso(this.detalle()?.avisadoUmbralEn ?? null));
  protected readonly avisoAgotada = computed(() => textoDeAviso(this.detalle()?.avisadoAgotadaEn ?? null));
  protected readonly consultas = computed<FilaConsultas[]>(() => {
    const porResultado = this.detalle()?.consultasPorResultado;
    if (!porResultado) return [];
    return RESULTADOS_CONSULTA.map((resultado) => ({ etiqueta: ETIQUETAS_RESULTADO_CONSULTA[resultado], cantidad: porResultado[resultado] }));
  });
  protected readonly totalConsultas = computed(() => this.consultas().reduce((suma, fila) => suma + fila.cantidad, 0));

  constructor() {
    void this.cargar();
  }

  protected abrirAjuste(): void {
    const detalle = this.detalle();
    if (!detalle) return;
    const datos: DatosPanelAjusteCuota = { detalle, recargarDetalle: () => this.recargar() };
    this.paneles
      .abrir<PanelAjusteCuotaComponent, DatosPanelAjusteCuota, ResultadoPanelAjusteCuota>(PanelAjusteCuotaComponent, { datos })
      .afterClosed()
      .subscribe((resultado) => {
        if (!resultado) return;
        this.avisos.toast('exito', MENSAJES_DETALLE_CUOTA.cuotaAjustada);
        void this.cargar();
      });
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.recargar();
    } catch (error) {
      this.error.set(aErrorIdentidad(error));
    } finally {
      this.cargando.set(false);
    }
  }

  private async recargar(): Promise<DetalleCuota> {
    const detalle = await this.cuotas.detalle(this.tenantId, this.periodo);
    this.detalle.set(detalle);
    return detalle;
  }
}

function textoDeAviso(instante: string | null): string {
  return instante ? textoAvisoEnviado(formatearFechaHora(instante)) : MENSAJES_DETALLE_CUOTA.sinAviso;
}
