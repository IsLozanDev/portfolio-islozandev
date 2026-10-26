import { DestroyRef, DOCUMENT, effect, inject, Injectable, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { CONFIG_AUTH } from '../config/config';
import { SesionService } from './sesion.service';

export const CLAVE_ULTIMA_ACTIVIDAD = 'vitrina.auth.ultima-actividad';
const EVENTOS_DE_ACTIVIDAD = ['pointerdown', 'keydown'] as const;
const EVENTO_VISIBILIDAD = 'visibilitychange';
const MS_POR_MINUTO = 60_000;
const MS_ENTRE_REVISIONES = MS_POR_MINUTO;
const MS_ENTRE_ESCRITURAS = 30_000;
const PARAMETRO_MOTIVO = 'motivo';
const MOTIVO_INACTIVIDAD = 'inactividad';

/**
 * Cierra la sesión tras `inactividadMinutos` sin actividad en ninguna pestaña (TR-RNF-014).
 * La última actividad va en `localStorage`: la cookie es común a todas las pestañas.
 */
@Injectable({ providedIn: 'root' })
export class InactividadService {
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly documento = inject(DOCUMENT);
  private readonly config = inject(CONFIG_AUTH);

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private oyentes: AbortController | null = null;
  private ultimaActividadLocal = 0;
  private ultimaEscritura = 0;

  constructor() {
    effect(() => {
      const autenticado = this.sesion.autenticado();
      untracked(() => (autenticado ? this.vigilar() : this.detener()));
    });
    inject(DestroyRef).onDestroy(() => this.detener());
  }

  private vigilar(): void {
    if (this.temporizador) return;
    this.registrarActividad(true);
    this.oyentes = new AbortController();
    const opciones = { passive: true, signal: this.oyentes.signal };
    EVENTOS_DE_ACTIVIDAD.forEach((evento) => this.documento.addEventListener(evento, () => this.registrarActividad(), opciones));
    this.documento.addEventListener(EVENTO_VISIBILIDAD, () => this.alCambiarVisibilidad(), opciones);
    this.temporizador = setInterval(() => this.revisar(), MS_ENTRE_REVISIONES);
  }

  private detener(): void {
    if (this.temporizador) clearInterval(this.temporizador);
    this.temporizador = null;
    this.oyentes?.abort();
    this.oyentes = null;
  }

  /** Al volver a la pestaña se revisa primero: el temporizador pudo estar congelado en segundo plano. */
  private alCambiarVisibilidad(): void {
    if (this.documento.visibilityState !== 'visible') return;
    if (this.revisar()) return;
    this.registrarActividad();
  }

  private registrarActividad(forzar = false): void {
    const ahora = Date.now();
    this.ultimaActividadLocal = ahora;
    if (!forzar && ahora - this.ultimaEscritura < MS_ENTRE_ESCRITURAS) return;
    this.ultimaEscritura = ahora;
    escribirAlmacen(this.documento, String(ahora));
  }

  /** Devuelve `true` si cerró la sesión. */
  private revisar(): boolean {
    const ultimaActividad = Math.max(this.ultimaActividadLocal, leerUltimaActividadCompartida(this.documento));
    if (Date.now() - ultimaActividad < this.config.inactividadMinutos * MS_POR_MINUTO) return false;
    this.detener();
    void this.cerrarPorInactividad();
    return true;
  }

  private async cerrarPorInactividad(): Promise<void> {
    await this.sesion.salir();
    await this.router.navigate([this.config.rutas.ingresar], { queryParams: { [PARAMETRO_MOTIVO]: MOTIVO_INACTIVIDAD } });
  }
}

/** `localStorage` puede no existir o lanzar (modo privado, bloqueado): se sigue solo con la pestaña actual. */
function leerUltimaActividadCompartida(documento: Document): number {
  try {
    return Number(documento.defaultView?.localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) || 0;
  } catch {
    return 0;
  }
}

function escribirAlmacen(documento: Document, valor: string): void {
  try {
    documento.defaultView?.localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, valor);
  } catch {
    // Sin almacenamiento compartido la vigilancia sigue con la actividad de esta pestaña.
  }
}
