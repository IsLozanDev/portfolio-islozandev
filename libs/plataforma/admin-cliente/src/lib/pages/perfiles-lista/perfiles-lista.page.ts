import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AccionesFilaDirective, FiltrosComponent, TablaComponent, type ColumnaTabla, type DefinicionFiltro, type ValorFiltros } from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import { ETIQUETAS_TIPO_PERFIL, MENSAJES_ADMIN, MENSAJES_PERFILES } from '../../models/mensajes-admin';
import type { Perfil } from '../../models/perfil';
import { PerfilesCliente } from '../../services/perfiles.cliente';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaPerfil {
  id: string;
  nombre: string;
  codigo: string;
  tipo: string;
  productos: string;
  roles: number;
}

type TipoPerfil = keyof typeof ETIQUETAS_TIPO_PERFIL;

interface FiltroPerfiles {
  tipo: TipoPerfil | null;
  busqueda: string;
}

const CLAVE_FILTRO_TIPO = 'tipo';
const SEPARADOR_PRODUCTOS = ', ';
/** La lista no se pagina (pocos perfiles por tenant): una sola página que los cubre todos. */
const TAMANO_SIN_PAGINAR = 1000;

const COLUMNAS: ColumnaTabla<FilaPerfil>[] = [
  { clave: 'nombre', titulo: MENSAJES_PERFILES.nombre },
  { clave: 'codigo', titulo: MENSAJES_PERFILES.codigo },
  { clave: 'tipo', titulo: MENSAJES_PERFILES.tipo },
  { clave: 'productos', titulo: MENSAJES_PERFILES.productos },
  { clave: 'roles', titulo: MENSAJES_PERFILES.roles },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: CLAVE_FILTRO_TIPO,
    etiqueta: MENSAJES_PERFILES.tipo,
    opciones: Object.entries(ETIQUETAS_TIPO_PERFIL).map(([valor, etiqueta]) => ({ valor, etiqueta })),
  },
];

/** Perfiles propios y predefinidos del tenant, con búsqueda y filtro por tipo en el cliente (U-04, TR-RF-012). */
@Component({
  selector: 'vit-perfiles-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './perfiles-lista.page.html',
})
export class PerfilesListaPage {
  private readonly perfiles = inject(PerfilesCliente);

  protected readonly mensajes = MENSAJES_PERFILES;
  protected readonly verDetalle = MENSAJES_ADMIN.verDetalle;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;
  protected readonly tamanosPagina = [TAMANO_SIN_PAGINAR];

  private readonly todos = signal<Perfil[]>([]);
  private readonly filtro = signal<FiltroPerfiles>({ tipo: null, busqueda: '' });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly filas = computed(() => this.todos().filter(cumpleFiltro(this.filtro())).map(filaDe));

  constructor() {
    void this.cargar();
  }

  protected filtrar(valor: ValorFiltros): void {
    this.filtro.set({
      tipo: (valor[CLAVE_FILTRO_TIPO] as TipoPerfil | null) ?? null,
      busqueda: valor.busqueda.trim().toLowerCase(),
    });
  }

  private async cargar(): Promise<void> {
    try {
      this.todos.set(await this.perfiles.listar());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function cumpleFiltro(filtro: FiltroPerfiles): (perfil: Perfil) => boolean {
  return (perfil) => {
    if (filtro.tipo && tipoDe(perfil) !== filtro.tipo) return false;
    if (!filtro.busqueda) return true;
    return perfil.nombre.toLowerCase().includes(filtro.busqueda) || perfil.codigo.toLowerCase().includes(filtro.busqueda);
  };
}

function tipoDe(perfil: Perfil): TipoPerfil {
  return perfil.predefinido ? 'predefinido' : 'propio';
}

function filaDe(perfil: Perfil): FilaPerfil {
  return {
    id: perfil.id,
    nombre: perfil.nombre,
    codigo: perfil.codigo,
    tipo: ETIQUETAS_TIPO_PERFIL[tipoDe(perfil)],
    productos: perfil.productos.join(SEPARADOR_PRODUCTOS),
    roles: perfil.totalRoles,
  };
}
