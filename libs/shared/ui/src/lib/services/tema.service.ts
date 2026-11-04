import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  ATRIBUTO_TEMA,
  CLAVE_TEMA,
  CONSULTA_OSCURO,
  PREFERENCIA_TEMA_POR_DEFECTO,
  PREFERENCIAS_TEMA,
  type PreferenciaTema,
  type TemaEfectivo,
} from '../models/tema';

/** Recuerda la preferencia de tema y escribe el tema efectivo en `<html>`. Sin valor válido o sin `localStorage`, sigue al sistema. */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly documento = inject(DOCUMENT);
  private readonly consultaOscuro = this.documento.defaultView?.matchMedia?.(CONSULTA_OSCURO) ?? null;
  private readonly preferenciaElegida = signal(preferenciaDesdeTexto(leerAlmacen()));
  private readonly sistemaOscuro = signal(this.consultaOscuro?.matches ?? false);

  readonly preferencia = this.preferenciaElegida.asReadonly();
  readonly efectivo = computed<TemaEfectivo>(() => {
    const preferencia = this.preferenciaElegida();
    if (preferencia !== 'sistema') return preferencia;
    return this.sistemaOscuro() ? 'oscuro' : 'claro';
  });

  constructor() {
    effect((alLimpiar) => {
      if (this.preferenciaElegida() !== 'sistema') return;
      alLimpiar(this.escucharSistema());
    });
    effect(() => this.documento.documentElement.setAttribute(ATRIBUTO_TEMA, this.efectivo()));
  }

  elegir(preferencia: PreferenciaTema): void {
    this.preferenciaElegida.set(preferencia);
    escribirAlmacen(preferencia);
  }

  /** Devuelve la función que deja de escuchar. */
  private escucharSistema(): () => void {
    const consulta = this.consultaOscuro;
    if (!consulta) return () => undefined;

    this.sistemaOscuro.set(consulta.matches);
    const alCambiar = (cambio: MediaQueryListEvent) => this.sistemaOscuro.set(cambio.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }
}

function preferenciaDesdeTexto(texto: string | null): PreferenciaTema {
  return PREFERENCIAS_TEMA.find((preferencia) => preferencia === texto) ?? PREFERENCIA_TEMA_POR_DEFECTO;
}

// `localStorage` puede no existir o lanzar (modo privado, datos bloqueados): la preferencia queda solo en memoria.
function leerAlmacen(): string | null {
  try {
    return globalThis.localStorage?.getItem(CLAVE_TEMA) ?? null;
  } catch {
    return null;
  }
}

function escribirAlmacen(valor: string): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_TEMA, valor);
  } catch {
    // Sin almacén, la preferencia vive solo mientras dure la página.
  }
}
