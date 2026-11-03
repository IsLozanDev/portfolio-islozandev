import { Component, computed, type ElementRef, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MENSAJES_SHELL, mensajeResultadosMenu, mensajeSinResultadosMenu } from '../../models/mensajes-shell';
import type { NodoMenu } from '../../models/nodo-menu';
import type { ResultadoBusquedaMenu } from '../../models/resultado-busqueda-menu';
import { buscarEnMenu } from '../../utils/buscar-en-menu';

const SIN_RESULTADO_ACTIVO = -1;
const SEPARADOR_GRUPOS = ' › ';

interface PartesNombre {
  antes: string;
  coincide: string;
  despues: string;
}

let siguienteInstancia = 0;

/**
 * Caja de búsqueda del menú con el patrón combobox de ARIA. Sin texto proyecta el árbol del menú;
 * con texto muestra los resultados. El texto escrito no se registra (TR-RNF-026).
 */
@Component({
  selector: 'vit-buscador-menu',
  imports: [MatIconModule],
  templateUrl: './buscador-menu.component.html',
  styleUrl: './buscador-menu.component.css',
})
export class BuscadorMenuComponent {
  readonly nodos = input.required<NodoMenu[]>();
  readonly elegido = output<ResultadoBusquedaMenu>();

  private readonly caja = viewChild.required<ElementRef<HTMLInputElement>>('caja');

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly idLista = `vit-buscador-menu-${siguienteInstancia++}`;
  protected readonly consulta = signal('');
  protected readonly indiceActivo = signal(SIN_RESULTADO_ACTIVO);
  protected readonly buscando = computed(() => this.consulta().trim().length > 0);
  protected readonly resultados = computed(() => buscarEnMenu(this.nodos(), this.consulta()));
  protected readonly hayResultados = computed(() => this.resultados().length > 0);
  protected readonly anuncio = computed(() => (this.buscando() ? mensajeResultadosMenu(this.resultados().length) : ''));
  protected readonly mensajeSinResultados = computed(() => mensajeSinResultadosMenu(this.consulta().trim()));
  protected readonly idActivo = computed(() => {
    const indice = this.indiceActivo();
    return indice === SIN_RESULTADO_ACTIVO ? null : this.idOpcion(indice);
  });

  enfocar(): void {
    this.caja().nativeElement.focus();
  }

  protected alEscribir(texto: string): void {
    this.consulta.set(texto);
    this.indiceActivo.set(SIN_RESULTADO_ACTIVO);
  }

  protected alPulsarTecla(evento: KeyboardEvent): void {
    switch (evento.key) {
      case 'ArrowDown':
        this.moverActivo(evento, 1);
        return;
      case 'ArrowUp':
        this.moverActivo(evento, -1);
        return;
      case 'Enter':
        this.elegirActivo(evento);
        return;
      case 'Escape':
        this.borrarConTecla(evento);
        return;
    }
  }

  protected borrar(): void {
    this.alEscribir('');
    this.enfocar();
  }

  protected elegir(resultado: ResultadoBusquedaMenu): void {
    this.alEscribir('');
    this.elegido.emit(resultado);
  }

  protected idOpcion(indice: number): string {
    return `${this.idLista}-opcion-${indice}`;
  }

  protected rutaDeGrupos(resultado: ResultadoBusquedaMenu): string {
    return resultado.grupos.join(SEPARADOR_GRUPOS);
  }

  protected partesNombre(resultado: ResultadoBusquedaMenu): PartesNombre {
    const { nombre, coincidencia } = resultado;
    if (!coincidencia) return { antes: nombre, coincide: '', despues: '' };
    return {
      antes: nombre.slice(0, coincidencia.inicio),
      coincide: nombre.slice(coincidencia.inicio, coincidencia.fin),
      despues: nombre.slice(coincidencia.fin),
    };
  }

  private moverActivo(evento: KeyboardEvent, paso: number): void {
    if (!this.hayResultados()) return;
    evento.preventDefault();
    const ultimo = this.resultados().length - 1;
    const siguiente = Math.min(Math.max(this.indiceActivo() + paso, 0), ultimo);
    this.indiceActivo.set(siguiente);
    document.getElementById(this.idOpcion(siguiente))?.scrollIntoView?.({ block: 'nearest' });
  }

  private elegirActivo(evento: KeyboardEvent): void {
    const resultado = this.resultados()[this.indiceActivo()];
    if (!resultado) return;
    evento.preventDefault();
    this.elegir(resultado);
  }

  /** Con texto, Esc solo borra la búsqueda: en celular no debe cerrar también el menú. */
  private borrarConTecla(evento: KeyboardEvent): void {
    if (!this.consulta()) return;
    evento.preventDefault();
    evento.stopPropagation();
    this.alEscribir('');
  }
}
