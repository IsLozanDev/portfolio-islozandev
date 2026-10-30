import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AccionesFilaDirective, FiltrosComponent, TablaComponent, type ColumnaTabla, type DefinicionFiltro, type ValorFiltros } from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import { ETIQUETAS_ESTADO_ROL, ETIQUETAS_TIPO_ROL, MENSAJES_ADMIN, MENSAJES_ROLES } from '../../models/mensajes-admin';
import type { Rol } from '../../models/rol';
import { RolesCliente } from '../../services/roles.cliente';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaRol {
  id: string;
  nombre: string;
  codigo: string;
  producto: string;
  tipo: string;
  estado: string;
  permisos: number;
}

type TipoRol = keyof typeof ETIQUETAS_TIPO_ROL;

interface FiltroRoles {
  producto: string | null;
  tipo: TipoRol | null;
  busqueda: string;
}

const CLAVE_FILTRO_PRODUCTO = 'producto';
const CLAVE_FILTRO_TIPO = 'tipo';
/** La lista no se pagina (pocos roles por tenant): una sola página que las cubre todas. */
const TAMANO_SIN_PAGINAR = 1000;

const COLUMNAS: ColumnaTabla<FilaRol>[] = [
  { clave: 'nombre', titulo: MENSAJES_ROLES.nombre },
  { clave: 'codigo', titulo: MENSAJES_ROLES.codigo },
  { clave: 'producto', titulo: MENSAJES_ROLES.producto },
  { clave: 'tipo', titulo: MENSAJES_ROLES.tipo },
  { clave: 'estado', titulo: MENSAJES_ROLES.estado },
  { clave: 'permisos', titulo: MENSAJES_ROLES.permisos },
];

const FILTRO_TIPO: DefinicionFiltro = {
  clave: CLAVE_FILTRO_TIPO,
  etiqueta: MENSAJES_ROLES.tipo,
  opciones: Object.entries(ETIQUETAS_TIPO_ROL).map(([valor, etiqueta]) => ({ valor, etiqueta })),
};

/** Roles propios y predefinidos del tenant, con filtro por producto y tipo en el cliente (U-04, TR-RF-011). */
@Component({
  selector: 'vit-roles-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './roles-lista.page.html',
})
export class RolesListaPage {
  private readonly roles = inject(RolesCliente);

  protected readonly mensajes = MENSAJES_ROLES;
  protected readonly verDetalle = MENSAJES_ADMIN.verDetalle;
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_SIN_PAGINAR];

  private readonly todos = signal<Rol[]>([]);
  private readonly filtro = signal<FiltroRoles>({ producto: null, tipo: null, busqueda: '' });
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly filtros = computed<DefinicionFiltro[]>(() => [filtroDeProducto(this.todos()), FILTRO_TIPO]);
  protected readonly filas = computed(() => this.todos().filter(cumpleFiltro(this.filtro())).map(filaDe));

  constructor() {
    void this.cargar();
  }

  protected filtrar(valor: ValorFiltros): void {
    this.filtro.set({
      producto: valor[CLAVE_FILTRO_PRODUCTO] ?? null,
      tipo: (valor[CLAVE_FILTRO_TIPO] as TipoRol | null) ?? null,
      busqueda: valor.busqueda.trim().toLowerCase(),
    });
  }

  private async cargar(): Promise<void> {
    try {
      this.todos.set(await this.roles.listar());
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function filtroDeProducto(roles: readonly Rol[]): DefinicionFiltro {
  const productos = new Map(roles.map((rol) => [rol.productoCodigo, rol.productoNombre]));
  return {
    clave: CLAVE_FILTRO_PRODUCTO,
    etiqueta: MENSAJES_ROLES.producto,
    opciones: [...productos].map(([valor, etiqueta]) => ({ valor, etiqueta })),
  };
}

function cumpleFiltro(filtro: FiltroRoles): (rol: Rol) => boolean {
  return (rol) => {
    if (filtro.producto && rol.productoCodigo !== filtro.producto) return false;
    if (filtro.tipo && tipoDe(rol) !== filtro.tipo) return false;
    if (!filtro.busqueda) return true;
    return rol.nombre.toLowerCase().includes(filtro.busqueda) || rol.codigo.toLowerCase().includes(filtro.busqueda);
  };
}

function tipoDe(rol: Rol): TipoRol {
  return rol.predefinido ? 'predefinido' : 'propio';
}

function filaDe(rol: Rol): FilaRol {
  return {
    id: rol.id,
    nombre: rol.nombre,
    codigo: rol.codigo,
    producto: rol.productoNombre,
    tipo: ETIQUETAS_TIPO_ROL[tipoDe(rol)],
    estado: rol.activo ? ETIQUETAS_ESTADO_ROL.activo : ETIQUETAS_ESTADO_ROL.inactivo,
    permisos: rol.totalPermisos,
  };
}
