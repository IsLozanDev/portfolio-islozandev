import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  AccionesFilaDirective,
  CeldaTablaDirective,
  ChipEstadoComponent,
  filasDePagina,
  TablaComponent,
  TAMANO_PAGINA_POR_DEFECTO,
  type CambioPagina,
  type ColumnaTabla,
  type TonoEstado,
} from '@vitrina/shared/ui';
import type { EmpresaConEmisor } from '../../models/emisor';
import { aErrorFe } from '../../models/error-fe';
import { ETIQUETA_SIN_EMISOR, ETIQUETAS_AMBIENTE, ETIQUETAS_ESTADO_EMISOR, TONO_SIN_EMISOR, TONOS_ESTADO_EMISOR } from '../../models/estado-emisor';
import { MENSAJES_EMISORES } from '../../models/mensajes-emisor';
import { EmisoresCliente } from '../../services/emisores.cliente';
import { ProveedoresFeService } from '../../services/proveedores-fe.service';
import { formatoFechaCorta } from '../../utils/fechas';
import { avisoVencimiento, type AvisoVencimiento } from '../../utils/vencimiento-certificado';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaEmisor {
  empresaId: string;
  empresa: string;
  ruc: string;
  proveedor: string;
  ambiente: string;
  estado: string;
  tonoEstado: TonoEstado;
  vence: string;
  aviso: AvisoVencimiento | null;
  configurado: boolean;
}

type NombreProveedor = (codigo: string) => string;

/** La API trae todas las empresas activas (pocas por tenant): se pagina en el navegador. */
const PRIMERA_PAGINA: CambioPagina = { indice: 0, tamano: TAMANO_PAGINA_POR_DEFECTO };

const COLUMNAS: ColumnaTabla<FilaEmisor>[] = [
  { clave: 'empresa', titulo: MENSAJES_EMISORES.empresa, movil: 'titulo' },
  { clave: 'ruc', titulo: MENSAJES_EMISORES.ruc, movil: 'detalle' },
  { clave: 'proveedor', titulo: MENSAJES_EMISORES.proveedor },
  { clave: 'ambiente', titulo: MENSAJES_EMISORES.ambiente },
  { clave: 'estado', titulo: MENSAJES_EMISORES.estado, tono: (fila) => fila.tonoEstado, movil: 'estado' },
  { clave: 'vence', titulo: MENSAJES_EMISORES.certificadoVence, movil: 'detalle' },
];

/** Empresas activas del tenant con el estado de su emisor electrónico (spec 62, UI de TR-RF-052). */
@Component({
  selector: 'vit-emisores-lista',
  imports: [MatButtonModule, MatIconModule, RouterLink, AccionesFilaDirective, CeldaTablaDirective, ChipEstadoComponent, TablaComponent],
  templateUrl: './emisores-lista.page.html',
})
export class EmisoresListaPage {
  private readonly emisores = inject(EmisoresCliente);
  private readonly proveedores = inject(ProveedoresFeService);

  protected readonly mensajes = MENSAJES_EMISORES;
  protected readonly columnas = COLUMNAS;

  private readonly empresas = signal<readonly EmpresaConEmisor[]>([]);
  private readonly ahora = signal(new Date());
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly paginaActual = signal<CambioPagina>(PRIMERA_PAGINA);

  /** Se recalcula cuando llega el catálogo: hasta entonces, o si no se puede leer, se ve el código del proveedor. */
  protected readonly filas = computed(() => {
    const nombreDe: NombreProveedor = (codigo) => this.proveedores.porCodigo(codigo)?.nombre ?? codigo;
    return this.empresas().map((empresa) => filaDe(empresa, nombreDe, this.ahora()));
  });
  protected readonly filasVisibles = computed(() => filasDePagina(this.filas(), this.paginaActual()));

  constructor() {
    void this.cargar();
    // El nombre del proveedor es un adorno: si falta `plat.catalogo.leer`, la lista sigue con el código.
    this.proveedores.cargar().catch(() => undefined);
  }

  protected paginar(cambio: CambioPagina): void {
    this.paginaActual.set(cambio);
  }

  private async cargar(): Promise<void> {
    try {
      this.empresas.set(await this.emisores.listar());
      this.ahora.set(new Date());
    } catch (error) {
      this.error.set(aErrorFe(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function filaDe({ empresaId, razonSocial, ruc, emisor }: EmpresaConEmisor, nombreDe: NombreProveedor, ahora: Date): FilaEmisor {
  const base = { empresaId, empresa: razonSocial, ruc };
  if (!emisor) {
    const sinDato = MENSAJES_EMISORES.sinDato;
    return { ...base, proveedor: sinDato, ambiente: sinDato, estado: ETIQUETA_SIN_EMISOR, tonoEstado: TONO_SIN_EMISOR, vence: sinDato, aviso: null, configurado: false };
  }
  const venceEn = emisor.certificadoVenceEn;
  return {
    ...base,
    proveedor: nombreDe(emisor.proveedor),
    ambiente: ETIQUETAS_AMBIENTE[emisor.ambiente],
    estado: ETIQUETAS_ESTADO_EMISOR[emisor.estado],
    tonoEstado: TONOS_ESTADO_EMISOR[emisor.estado],
    vence: venceEn ? formatoFechaCorta(venceEn) : MENSAJES_EMISORES.sinDato,
    aviso: venceEn ? avisoVencimiento(venceEn, ahora) : null,
    configurado: true,
  };
}
