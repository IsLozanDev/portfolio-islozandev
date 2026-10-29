import { Component, DestroyRef, inject, input, output, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { DefinicionFiltro, ValorFiltros } from '../../models/filtro';
import { MENSAJES_UI } from '../../models/mensajes-ui';

export const ESPERA_BUSQUEDA_MS = 300;

/**
 * Búsqueda con espera y filtros de selección; emite el valor completo en cada cambio. `valorInicial`
 * precarga los controles (p. ej. desde la URL) sin emitir.
 */
@Component({
  selector: 'vit-filtros',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './filtros.component.html',
})
export class FiltrosComponent implements OnInit {
  readonly definiciones = input<DefinicionFiltro[]>([]);
  readonly placeholderBusqueda = input<string>(MENSAJES_UI.buscar);
  readonly valorInicial = input<Readonly<Record<string, string | null>>>({});
  readonly cambio = output<ValorFiltros>();

  protected readonly busqueda = signal('');
  protected readonly selecciones = signal<Readonly<Record<string, string | null>>>({});
  protected readonly textoTodos = MENSAJES_UI.todos;
  protected readonly textoLimpiar = MENSAJES_UI.limpiar;

  private esperaBusqueda: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.esperaBusqueda));
  }

  ngOnInit(): void {
    const { busqueda, ...selecciones } = this.valorInicial();
    this.busqueda.set(busqueda ?? '');
    this.selecciones.set(selecciones);
  }

  protected escribirBusqueda(texto: string): void {
    this.busqueda.set(texto);
    clearTimeout(this.esperaBusqueda);
    this.esperaBusqueda = setTimeout(() => this.emitir(), ESPERA_BUSQUEDA_MS);
  }

  protected elegir(clave: string, valor: string | null): void {
    this.selecciones.update((actuales) => ({ ...actuales, [clave]: valor }));
    this.emitir();
  }

  protected limpiar(): void {
    this.busqueda.set('');
    this.selecciones.set({});
    this.emitir();
  }

  private emitir(): void {
    clearTimeout(this.esperaBusqueda);
    const selecciones = this.selecciones();
    const filtros = Object.fromEntries(this.definiciones().map((definicion) => [definicion.clave, selecciones[definicion.clave] ?? null]));
    this.cambio.emit({ ...filtros, busqueda: this.busqueda() });
  }
}
