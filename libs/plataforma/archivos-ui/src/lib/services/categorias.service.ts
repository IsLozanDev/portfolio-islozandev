import { inject, Injectable, signal } from '@angular/core';
import type { Categoria } from '../models/categoria';
import { ArchivosCliente } from './archivos.cliente';

/** Las categorías de archivo se piden una vez por sesión; si la petición falla, la siguiente llamada reintenta. */
@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly cliente = inject(ArchivosCliente);
  private readonly lista = signal<readonly Categoria[] | null>(null);
  private enCurso: Promise<readonly Categoria[]> | null = null;

  /** `null` hasta que llegan. */
  readonly categorias = this.lista.asReadonly();

  cargar(): Promise<readonly Categoria[]> {
    const cargadas = this.lista();
    if (cargadas) return Promise.resolve(cargadas);
    this.enCurso ??= this.pedir();
    return this.enCurso;
  }

  async buscar(codigo: string): Promise<Categoria | undefined> {
    return (await this.cargar()).find((categoria) => categoria.codigo === codigo);
  }

  private async pedir(): Promise<readonly Categoria[]> {
    try {
      const categorias = await this.cliente.categorias();
      this.lista.set(categorias);
      return categorias;
    } finally {
      this.enCurso = null;
    }
  }
}
