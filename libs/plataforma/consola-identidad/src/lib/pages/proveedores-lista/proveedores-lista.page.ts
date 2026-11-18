import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  AccionesFilaDirective,
  AvisosService,
  EstadoVacioComponent,
  PanelLateralService,
  TablaComponent,
  type ColumnaTabla,
  type TonoEstado,
} from '@vitrina/shared/ui';
import { PanelProveedorComponent, type DatosPanelProveedor, type ResultadoPanelProveedor } from '../../components/panel-proveedor/panel-proveedor.component';
import { aErrorIdentidad, CODIGO_OPERADOR_REQUERIDO, ErrorIdentidad } from '../../models/error-identidad';
import { COLUMNAS_PROVEEDORES, MENSAJES_POR_CODIGO, MENSAJES_PROVEEDORES } from '../../models/mensajes-identidad';
import type { Proveedor } from '../../models/proveedor';
import { TONOS_PROVEEDOR } from '../../models/tonos';
import { ProveedoresCliente } from '../../services/proveedores.cliente';

const CODIGO_PROVEEDOR_NO_ENCONTRADO = 'PROVEEDOR_NO_ENCONTRADO';
const HTTP_NO_ENCONTRADO = 404;
/** Son pocos: una sola página con todos. */
const TAMANO_PAGINA_PROVEEDORES = 50;

/** Lo que muestra cada celda, ya como texto. */
export interface FilaProveedor {
  codigo: string;
  prioridad: number;
  tiposDoc: string;
  ttlDias: number;
  timeoutMs: number;
  estado: string;
  tonoEstado: TonoEstado;
}

const COLUMNAS: ColumnaTabla<FilaProveedor>[] = [
  { clave: 'prioridad', titulo: COLUMNAS_PROVEEDORES.prioridad },
  { clave: 'codigo', titulo: COLUMNAS_PROVEEDORES.codigo, movil: 'titulo' },
  { clave: 'tiposDoc', titulo: COLUMNAS_PROVEEDORES.tiposDoc, movil: 'detalle' },
  { clave: 'ttlDias', titulo: COLUMNAS_PROVEEDORES.ttlDias },
  { clave: 'timeoutMs', titulo: COLUMNAS_PROVEEDORES.timeoutMs },
  { clave: 'estado', titulo: COLUMNAS_PROVEEDORES.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
];

/** Proveedores DNI/RUC por prioridad (spec 30; pantalla tipo «Lista»). La edición va en el panel lateral. Sin credenciales. */
@Component({
  selector: 'vit-proveedores-lista',
  imports: [MatButtonModule, MatIconModule, AccionesFilaDirective, EstadoVacioComponent, TablaComponent],
  templateUrl: './proveedores-lista.page.html',
})
export class ProveedoresListaPage {
  private readonly proveedores = inject(ProveedoresCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);

  protected readonly mensajes = MENSAJES_PROVEEDORES;
  protected readonly mensajeSoloOperador = MENSAJES_POR_CODIGO[CODIGO_OPERADOR_REQUERIDO];
  protected readonly columnas = COLUMNAS;
  protected readonly tamanosPagina = [TAMANO_PAGINA_PROVEEDORES];

  private readonly lista = signal<Proveedor[]>([]);
  protected readonly filas = computed(() => this.lista().map(filaDe));
  protected readonly cargando = signal(true);
  protected readonly error = signal<ErrorIdentidad | null>(null);
  protected readonly soloOperador = computed(() => this.error()?.codigo === CODIGO_OPERADOR_REQUERIDO);

  constructor() {
    void this.cargar();
  }

  protected editar(codigo: string): void {
    const proveedor = this.buscarProveedor(codigo);
    if (!proveedor) return;
    const datos: DatosPanelProveedor = { proveedor, recargarProveedor: () => this.recargarProveedor(codigo) };
    this.paneles
      .abrir<PanelProveedorComponent, DatosPanelProveedor, ResultadoPanelProveedor>(PanelProveedorComponent, { datos })
      .afterClosed()
      .subscribe((resultado) => {
        if (!resultado) return;
        this.avisos.toast('exito', MENSAJES_PROVEEDORES.proveedorActualizado);
        void this.cargar();
      });
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.lista.set(await this.proveedores.listar());
    } catch (error) {
      this.error.set(aErrorIdentidad(error));
    } finally {
      this.cargando.set(false);
    }
  }

  private async recargarProveedor(codigo: string): Promise<Proveedor> {
    this.lista.set(await this.proveedores.listar());
    const proveedor = this.buscarProveedor(codigo);
    if (!proveedor) throw new ErrorIdentidad(CODIGO_PROVEEDOR_NO_ENCONTRADO, MENSAJES_POR_CODIGO[CODIGO_PROVEEDOR_NO_ENCONTRADO], HTTP_NO_ENCONTRADO);
    return proveedor;
  }

  private buscarProveedor(codigo: string): Proveedor | undefined {
    return this.lista().find((candidato) => candidato.codigo === codigo);
  }
}

function filaDe(proveedor: Proveedor): FilaProveedor {
  return {
    codigo: proveedor.codigo,
    prioridad: proveedor.prioridad,
    tiposDoc: proveedor.tiposDoc.join(', '),
    ttlDias: proveedor.ttlDias,
    timeoutMs: proveedor.timeoutMs,
    estado: proveedor.activo ? MENSAJES_PROVEEDORES.activo : MENSAJES_PROVEEDORES.inactivo,
    tonoEstado: proveedor.activo ? TONOS_PROVEEDOR.activo : TONOS_PROVEEDOR.inactivo,
  };
}
