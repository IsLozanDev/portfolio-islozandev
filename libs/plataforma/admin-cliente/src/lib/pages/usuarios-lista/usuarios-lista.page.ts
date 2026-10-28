import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import {
  AccionesFilaDirective,
  FiltrosComponent,
  TablaComponent,
  type CambioOrden,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import type { Listado } from '../../models/listado';
import { COLUMNAS_MIEMBROS, ETIQUETAS_ESTADO_MEMBRESIA, MENSAJES_ADMIN } from '../../models/mensajes-admin';
import { ESTADOS_MEMBRESIA, type EstadoMembresia, type FiltroMiembros, type Miembro, type OrdenMiembros } from '../../models/miembro';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { MiembrosCliente } from '../../services/miembros.cliente';
import { formatearFechaHora } from '../../utils/formato';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaMiembro {
  membresiaId: string;
  nombre: string;
  correo: string;
  estado: string;
  propietario: string;
  asignacionesVigentes: number;
  invitacionVence: string;
}

/** El primero es el de la API (spec 17a): 20 por página. */
export const TAMANOS_PAGINA_MIEMBROS = [20, 50, 100];
const CLAVE_FILTRO_ESTADO = 'estado';
const ORDENES_PERMITIDOS: readonly string[] = ['nombre', 'correo', 'estado'] satisfies OrdenMiembros[];

export const FILTRO_INICIAL: FiltroMiembros = { orden: 'nombre', direccion: 'asc', pagina: 1, tamano: TAMANOS_PAGINA_MIEMBROS[0] };

const COLUMNAS: ColumnaTabla<FilaMiembro>[] = [
  { clave: 'nombre', titulo: COLUMNAS_MIEMBROS.nombre, ordenable: true },
  { clave: 'correo', titulo: COLUMNAS_MIEMBROS.correo, ordenable: true },
  { clave: 'estado', titulo: COLUMNAS_MIEMBROS.estado, ordenable: true },
  { clave: 'propietario', titulo: COLUMNAS_MIEMBROS.propietario },
  { clave: 'asignacionesVigentes', titulo: COLUMNAS_MIEMBROS.asignacionesVigentes },
  { clave: 'invitacionVence', titulo: COLUMNAS_MIEMBROS.invitacionVence },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: CLAVE_FILTRO_ESTADO,
    etiqueta: COLUMNAS_MIEMBROS.estado,
    opciones: ESTADOS_MEMBRESIA.map((estado) => ({ valor: estado, etiqueta: ETIQUETAS_ESTADO_MEMBRESIA[estado] })),
  },
];

/** Lista de miembros del tenant con filtros, orden y páginas del servidor (U-03, TR-RF-009 y 014). */
@Component({
  selector: 'vit-usuarios-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, SiPermisoDirective, AccionesFilaDirective, FiltrosComponent, TablaComponent],
  templateUrl: './usuarios-lista.page.html',
})
export class UsuariosListaPage {
  private readonly miembros = inject(MiembrosCliente);

  protected readonly mensajes = MENSAJES_ADMIN;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;
  protected readonly tamanosPagina = TAMANOS_PAGINA_MIEMBROS;

  protected readonly filtro = signal<FiltroMiembros>(FILTRO_INICIAL);
  protected readonly listado = signal<Listado<FilaMiembro>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    void this.cargar();
  }

  protected filtrar(valor: ValorFiltros): void {
    const estado = valor[CLAVE_FILTRO_ESTADO] as EstadoMembresia | null;
    this.actualizar({ estado: estado ?? undefined, busqueda: valor.busqueda.trim() || undefined, pagina: 1 });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.actualizar({ pagina: indice + 1, tamano });
  }

  protected ordenar({ clave, direccion }: CambioOrden): void {
    if (direccion === '' || !ORDENES_PERMITIDOS.includes(clave)) {
      this.actualizar({ orden: FILTRO_INICIAL.orden, direccion: FILTRO_INICIAL.direccion, pagina: 1 });
      return;
    }
    this.actualizar({ orden: clave as OrdenMiembros, direccion, pagina: 1 });
  }

  private actualizar(cambios: Partial<FiltroMiembros>): void {
    this.filtro.update((actual) => ({ ...actual, ...cambios }));
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.miembros.listar(this.filtro());
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
    } catch (error) {
      if (consulta === this.consultaActual) this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(miembro: Miembro): FilaMiembro {
  return {
    membresiaId: miembro.membresiaId,
    nombre: miembro.nombre,
    correo: miembro.correo,
    estado: ETIQUETAS_ESTADO_MEMBRESIA[miembro.estado],
    propietario: miembro.esPropietario ? MENSAJES_ADMIN.si : MENSAJES_ADMIN.no,
    asignacionesVigentes: miembro.asignacionesVigentes,
    invitacionVence: miembro.invitacionExpiraEn ? formatearFechaHora(miembro.invitacionExpiraEn) : MENSAJES_ADMIN.sinFecha,
  };
}
