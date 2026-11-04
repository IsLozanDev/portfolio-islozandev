import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AccionesFilaDirective,
  FiltrosComponent,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import { TIPOS_EVENTO, type EventoSeguridad, type FiltroBitacora, type TipoEvento } from '../../models/evento-seguridad';
import type { Listado } from '../../models/listado';
import { COLUMNAS_BITACORA, ETIQUETAS_TIPO_EVENTO, MENSAJES_BITACORA, TONOS_TIPO_EVENTO } from '../../models/mensajes-bitacora';
import { AdaptadorFechaPeru } from '../../services/adaptador-fecha-peru.service';
import { BitacoraCliente } from '../../services/bitacora.cliente';
import { CalendarioEnEspanol } from '../../services/calendario-en-espanol.service';
import { filtroBitacoraDesdeUrl, filtroBitacoraParaUrl, LONGITUD_MINIMA_USUARIO, PARAMETRO_URL_BITACORA } from '../../utils/filtro-url-bitacora';
import { formatearFechaHora } from '../../utils/formato';
import { fechaCalendario } from '../../utils/formulario-asignacion';

const LOCALE_PERU = 'es-PE';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaEvento {
  id: string;
  fecha: string;
  tipo: string;
  tonoTipo: TonoEstado;
  usuario: string;
  resumen: string;
}

const COLUMNAS: ColumnaTabla<FilaEvento>[] = [
  { clave: 'fecha', titulo: COLUMNAS_BITACORA.fecha, movil: 'titulo' },
  { clave: 'tipo', titulo: COLUMNAS_BITACORA.tipo, movil: 'estado', tono: (fila) => fila.tonoTipo },
  { clave: 'usuario', titulo: COLUMNAS_BITACORA.usuario, movil: 'detalle' },
  { clave: 'resumen', titulo: COLUMNAS_BITACORA.resumen },
];

const FILTROS: DefinicionFiltro[] = [
  {
    clave: PARAMETRO_URL_BITACORA.tipo,
    etiqueta: COLUMNAS_BITACORA.tipo,
    opciones: TIPOS_EVENTO.map((tipo) => ({ valor: tipo, etiqueta: ETIQUETAS_TIPO_EVENTO[tipo] })),
  },
];

/** Bitácora de seguridad del tenant con filtros en la URL (spec 18, TR-RF-019; pantalla tipo «Lista»). */
@Component({
  selector: 'vit-bitacora-lista',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    AccionesFilaDirective,
    FiltrosComponent,
    TablaComponent,
  ],
  providers: [
    provideNativeDateAdapter(),
    { provide: DateAdapter, useClass: AdaptadorFechaPeru },
    { provide: MAT_DATE_LOCALE, useValue: LOCALE_PERU },
    { provide: MatDatepickerIntl, useClass: CalendarioEnEspanol },
  ],
  templateUrl: './bitacora-lista.page.html',
})
export class BitacoraListaPage {
  private readonly bitacora = inject(BitacoraCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_BITACORA;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = FILTROS;

  protected readonly filtro = signal<FiltroBitacora>(filtroBitacoraDesdeUrl(this.ruta.snapshot.queryParamMap, new Date()));
  /** `vit-filtros` lo lee una vez al iniciar: la búsqueda y el tipo que traía la URL. */
  protected readonly valorInicialFiltros = valorDeFiltros(this.filtro());
  protected readonly rango = new FormGroup({
    desde: new FormControl<Date | null>(desdeFecha(this.filtro().desde)),
    hasta: new FormControl<Date | null>(desdeFecha(this.filtro().hasta)),
  });
  protected readonly listado = signal<Listado<FilaEvento>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroBitacoraDesdeUrl(parametros, new Date()));
      void this.cargar();
    });
  }

  /** Solo con las dos fechas: el selector emite al elegir la primera. */
  protected cambiarRango(): void {
    const { desde, hasta } = this.rango.getRawValue();
    if (!desde || !hasta) return;
    this.navegar({ desde: fechaCalendario(desde), hasta: fechaCalendario(hasta), pagina: 1 });
  }

  protected filtrar(valor: ValorFiltros): void {
    const tipo = valor[PARAMETRO_URL_BITACORA.tipo] as TipoEvento | null;
    const usuario = valor.busqueda.trim();
    this.navegar({ tipo: tipo ?? undefined, usuario: usuario.length >= LONGITUD_MINIMA_USUARIO ? usuario : undefined, pagina: 1 });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ pagina: indice + 1, tamano });
  }

  private navegar(cambios: Partial<FiltroBitacora>): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: filtroBitacoraParaUrl({ ...this.filtro(), ...cambios }) });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.bitacora.listar(this.filtro());
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: listado.items.map(filaDe), total: listado.total });
    } catch (error) {
      if (consulta !== this.consultaActual) return;
      this.listado.set({ items: [], total: 0 });
      this.error.set(aErrorAdmin(error).message);
    } finally {
      if (consulta === this.consultaActual) this.cargando.set(false);
    }
  }
}

function filaDe(evento: EventoSeguridad): FilaEvento {
  return {
    id: evento.id,
    fecha: formatearFechaHora(evento.ocurridoEn),
    tipo: ETIQUETAS_TIPO_EVENTO[evento.tipo],
    tonoTipo: TONOS_TIPO_EVENTO[evento.tipo],
    usuario: evento.usuario?.nombre ?? MENSAJES_BITACORA.sistema,
    resumen: evento.resumen ?? MENSAJES_BITACORA.sinDato,
  };
}

function valorDeFiltros(filtro: FiltroBitacora): Record<string, string | null> {
  return { busqueda: filtro.usuario ?? '', [PARAMETRO_URL_BITACORA.tipo]: filtro.tipo ?? null };
}

/** `YYYY-MM-DD` como medianoche local: el selector trabaja en la zona del navegador. */
function desdeFecha(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}
