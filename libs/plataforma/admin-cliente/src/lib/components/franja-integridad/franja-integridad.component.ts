import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ETIQUETAS_MOTIVO_ROTURA, MENSAJES_AUDITORIA } from '../../models/mensajes-auditoria';
import type { EstadoFranja, VerificacionIntegridad } from '../../models/verificacion-integridad';
import { formatearFechaHora } from '../../utils/formato';

/** Lo que pinta la franja cuando hay algo que decir; `null` no ocupa alto. */
interface VistaFranja {
  estado: 'ok' | 'rota' | 'sin-verificar';
  icono: string;
  fecha: string | null;
  verificacion: VerificacionIntegridad | null;
  motivo: string | null;
}

const VISTA_SIN_VERIFICAR: VistaFranja = { estado: 'sin-verificar', icono: 'schedule', fecha: null, verificacion: null, motivo: null };

/**
 * Último resultado de la verificación de la cadena (spec 20c, TR-RNF-112). La página hace la llamada y
 * le pasa el estado: así se prueba sin HTTP.
 */
@Component({
  selector: 'vit-franja-integridad',
  imports: [MatIconModule],
  templateUrl: './franja-integridad.component.html',
})
export class FranjaIntegridadComponent {
  readonly estado = input.required<EstadoFranja>();

  protected readonly mensajes = MENSAJES_AUDITORIA;
  protected readonly vista = computed(() => vistaDe(this.estado()));
}

function vistaDe(estado: EstadoFranja): VistaFranja | null {
  if (estado.tipo === 'sin-verificar') return VISTA_SIN_VERIFICAR;
  if (estado.tipo !== 'verificada') return null;
  const { verificacion } = estado;
  const rota = verificacion.estado === 'ROTA';
  return {
    estado: rota ? 'rota' : 'ok',
    icono: rota ? 'gpp_bad' : 'verified',
    fecha: formatearFechaHora(verificacion.terminadaEn),
    verificacion,
    motivo: verificacion.motivo ? ETIQUETAS_MOTIVO_ROTURA[verificacion.motivo] : null,
  };
}
