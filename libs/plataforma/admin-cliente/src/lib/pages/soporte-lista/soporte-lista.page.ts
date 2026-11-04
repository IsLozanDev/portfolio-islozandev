import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterLink, type ParamMap } from '@angular/router';
import { AccionSensibleService } from '@vitrina/shared/shell';
import {
  AccionesFilaDirective,
  AvisosService,
  TablaComponent,
  tamanoPaginaParaUrl,
  type CambioPagina,
  type ColumnaTabla,
  type TonoEstado,
} from '@vitrina/shared/ui';
import { VISTAS_SOPORTE, type SolicitudSoporte, type VistaSoporte } from '../../models/acceso-soporte';
import { aErrorAdmin } from '../../models/error-admin';
import type { Listado } from '../../models/listado';
import {
  COLUMNAS_SOPORTE,
  ETIQUETAS_CAUSA_CIERRE,
  ETIQUETAS_ESTADO_SOPORTE,
  ETIQUETAS_MODO_SOPORTE,
  ETIQUETAS_VISTA_SOPORTE,
  MENSAJES_SOPORTE,
  TONOS_ESTADO_SOPORTE,
} from '../../models/mensajes-soporte';
import { LONGITUD_MINIMA_MOTIVO_SEG } from '../../models/motivo-seg';
import { InsigniasSoporteService } from '../../services/insignias-soporte.service';
import { SoporteCliente } from '../../services/soporte.cliente';
import { PARAMETRO_URL_ORGANIZACION, paginaDesdeUrl, paginaParaUrl, tamanoDesdeUrl } from '../../utils/filtro-url-organizacion';
import { formatearFechaHora } from '../../utils/formato';

export const PARAMETRO_VISTA = 'vista';
const VISTA_POR_DEFECTO: VistaSoporte = 'pendientes';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaSolicitud {
  id: string;
  agente: string;
  ticket: string;
  modo: string;
  horas: number;
  fecha: string;
  estado: string;
  tonoEstado: TonoEstado;
}

/** La columna de fecha cambia de sentido con la pestaña: cuándo se pidió, hasta cuándo dura o cómo terminó. */
const TITULO_FECHA: Readonly<Record<VistaSoporte, string>> = { pendientes: 'Solicitada', vigentes: 'Termina', historial: 'Cierre' };

const TEXTO_VACIO: Readonly<Record<VistaSoporte, string>> = {
  pendientes: MENSAJES_SOPORTE.sinPendientes,
  vigentes: MENSAJES_SOPORTE.sinVigentes,
  historial: MENSAJES_SOPORTE.sinHistorial,
};

function vistaDesdeUrl(parametros: ParamMap): VistaSoporte {
  const vista = parametros.get(PARAMETRO_VISTA);
  return (VISTAS_SOPORTE as readonly string[]).includes(vista ?? '') ? (vista as VistaSoporte) : VISTA_POR_DEFECTO;
}

/** Bandeja de solicitudes y accesos de soporte del tenant (spec 18, TR-RF-020; pantalla tipo «Lista»). */
@Component({
  selector: 'vit-soporte-lista',
  imports: [MatButtonModule, MatIconModule, MatTabsModule, RouterLink, AccionesFilaDirective, TablaComponent],
  templateUrl: './soporte-lista.page.html',
})
export class SoporteListaPage {
  private readonly soporte = inject(SoporteCliente);
  private readonly insignias = inject(InsigniasSoporteService);
  private readonly avisos = inject(AvisosService);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_SOPORTE;
  protected readonly vistas = VISTAS_SOPORTE;
  protected readonly etiquetasVista = ETIQUETAS_VISTA_SOPORTE;
  protected readonly vista = signal<VistaSoporte>(vistaDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly pagina = signal(paginaDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly tamano = signal(tamanoDesdeUrl(this.ruta.snapshot.queryParamMap));
  protected readonly pendientes = this.insignias.pendientes;
  protected readonly textoVacio = computed(() => TEXTO_VACIO[this.vista()]);
  protected readonly columnas = computed<ColumnaTabla<FilaSolicitud>[]>(() => [
    { clave: 'agente', titulo: COLUMNAS_SOPORTE.agente, movil: 'titulo' },
    { clave: 'ticket', titulo: COLUMNAS_SOPORTE.ticket, movil: 'detalle' },
    { clave: 'modo', titulo: COLUMNAS_SOPORTE.modo },
    { clave: 'horas', titulo: COLUMNAS_SOPORTE.horas },
    { clave: 'fecha', titulo: TITULO_FECHA[this.vista()] },
    { clave: 'estado', titulo: COLUMNAS_SOPORTE.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
  ]);
  protected readonly listado = signal<Listado<FilaSolicitud>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un cambio rápido de pestaña no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.vista.set(vistaDesdeUrl(parametros));
      this.pagina.set(paginaDesdeUrl(parametros));
      this.tamano.set(tamanoDesdeUrl(parametros));
      void this.cargar();
    });
  }

  /** La pestaña por defecto no va en la URL. */
  protected parametrosDeVista(vista: VistaSoporte): Record<string, string | null> {
    return { [PARAMETRO_VISTA]: vista === VISTA_POR_DEFECTO ? null : vista };
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    const queryParams = {
      ...this.parametrosDeVista(this.vista()),
      [PARAMETRO_URL_ORGANIZACION.pagina]: paginaParaUrl(indice + 1),
      [PARAMETRO_URL_ORGANIZACION.tamano]: tamanoPaginaParaUrl(tamano),
    };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams });
  }

  protected rechazar(fila: FilaSolicitud): Promise<void> {
    return this.cerrar(MENSAJES_SOPORTE.tituloRechazar, MENSAJES_SOPORTE.textoRechazar, MENSAJES_SOPORTE.rechazar, MENSAJES_SOPORTE.rechazado, (motivo) =>
      this.soporte.rechazar(fila.id, motivo),
    );
  }

  protected revocar(fila: FilaSolicitud): Promise<void> {
    return this.cerrar(MENSAJES_SOPORTE.tituloRevocar, MENSAJES_SOPORTE.textoRevocar, MENSAJES_SOPORTE.revocar, MENSAJES_SOPORTE.revocado, (motivo) =>
      this.soporte.revocar(fila.id, motivo),
    );
  }

  /** plat.soporte.autorizar es sensible (TR-RN-009): MFA reciente, confirmación con motivo y recarga. */
  private async cerrar(titulo: string, texto: string, textoConfirmar: string, hecho: string, ejecutar: (motivo: string) => Promise<void>): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    const respuesta = await this.avisos.confirmarDestructiva({ titulo, texto, textoConfirmar, pedirMotivo: true, longitudMinimaMotivo: LONGITUD_MINIMA_MOTIVO_SEG });
    if (!respuesta.confirmado || respuesta.motivo === null) return;

    this.ocupado.set(true);
    this.error.set(null);
    try {
      await ejecutar(respuesta.motivo);
      this.avisos.toast('exito', hecho);
      await Promise.all([this.cargar(), this.insignias.actualizar()]);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    const vista = this.vista();
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.soporte.listar({ vista, pagina: this.pagina(), tamano: this.tamano() });
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map((solicitud) => filaDe(solicitud, vista)), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function fechaDe(solicitud: SolicitudSoporte, vista: VistaSoporte): string {
  if (vista === 'vigentes') return solicitud.hasta ? formatearFechaHora(solicitud.hasta) : MENSAJES_SOPORTE.sinDato;
  if (vista === 'historial') {
    const cierre = solicitud.cerradoEn ? formatearFechaHora(solicitud.cerradoEn) : MENSAJES_SOPORTE.sinDato;
    return solicitud.causaCierre ? `${cierre} · ${ETIQUETAS_CAUSA_CIERRE[solicitud.causaCierre]}` : cierre;
  }
  return formatearFechaHora(solicitud.solicitadoEn);
}

function filaDe(solicitud: SolicitudSoporte, vista: VistaSoporte): FilaSolicitud {
  return {
    id: solicitud.id,
    agente: solicitud.agente.nombre,
    ticket: solicitud.ticket,
    modo: ETIQUETAS_MODO_SOPORTE[solicitud.modo],
    horas: solicitud.horasAprobadas ?? solicitud.horasSolicitadas,
    fecha: fechaDe(solicitud, vista),
    estado: ETIQUETAS_ESTADO_SOPORTE[solicitud.estado],
    tonoEstado: TONOS_ESTADO_SOPORTE[solicitud.estado],
  };
}
