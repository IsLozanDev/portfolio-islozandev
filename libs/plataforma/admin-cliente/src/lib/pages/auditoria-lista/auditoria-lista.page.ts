import { Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CONFIG_AUTH, PARAMETRO_RETORNO, SesionService, SiPermisoDirective } from '@vitrina/shared/auth';
import {
  AccionesFilaDirective,
  AvisosService,
  CargandoComponent,
  FiltrosComponent,
  TablaComponent,
  type CambioPagina,
  type ColumnaTabla,
  type DefinicionFiltro,
  type TonoEstado,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { FranjaIntegridadComponent } from '../../components/franja-integridad/franja-integridad.component';
import { aErrorAdmin, CODIGO_MFA_REQUERIDA, type ErrorAdmin } from '../../models/error-admin';
import { TIPOS_EVENTO_AUDITORIA, type EventoAuditoria, type FiltroAuditoria, type TipoEventoAuditoria } from '../../models/evento-auditoria';
import type { Listado } from '../../models/listado';
import { COLUMNAS_AUDITORIA, ETIQUETAS_TIPO_AUDITORIA, MENSAJES_AUDITORIA, TONOS_TIPO_AUDITORIA } from '../../models/mensajes-auditoria';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import type { EstadoFranja } from '../../models/verificacion-integridad';
import { AdaptadorFechaPeru } from '../../services/adaptador-fecha-peru.service';
import { AuditoriaCliente } from '../../services/auditoria.cliente';
import { CalendarioEnEspanol } from '../../services/calendario-en-espanol.service';
import { descargarArchivo } from '../../utils/descarga';
import {
  accionNormalizada,
  ESTADO_RETORNO_AUDITORIA,
  filtroAuditoriaDesdeUrl,
  filtroAuditoriaParaUrl,
  PARAMETRO_URL_AUDITORIA,
} from '../../utils/filtro-url-auditoria';
import { LONGITUD_MINIMA_USUARIO } from '../../utils/filtro-url-bitacora';
import { formatearFechaHora } from '../../utils/formato';
import { fechaCalendario } from '../../utils/formulario-asignacion';

const LOCALE_PERU = 'es-PE';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaAuditoria {
  id: string;
  fecha: string;
  tipo: string;
  tonoTipo: TonoEstado;
  accion: string;
  entidad: string;
  usuario: string;
  sucursal: string;
}

const COLUMNAS: ColumnaTabla<FilaAuditoria>[] = [
  { clave: 'fecha', titulo: COLUMNAS_AUDITORIA.fecha, movil: 'detalle' },
  { clave: 'tipo', titulo: COLUMNAS_AUDITORIA.tipo, movil: 'estado', tono: (fila) => fila.tonoTipo },
  { clave: 'accion', titulo: COLUMNAS_AUDITORIA.accion, movil: 'titulo' },
  { clave: 'entidad', titulo: COLUMNAS_AUDITORIA.entidad },
  { clave: 'usuario', titulo: COLUMNAS_AUDITORIA.usuario, movil: 'detalle' },
  { clave: 'sucursal', titulo: COLUMNAS_AUDITORIA.sucursal },
];

const DEFINICION_TIPO: DefinicionFiltro = {
  clave: PARAMETRO_URL_AUDITORIA.tipo,
  etiqueta: MENSAJES_AUDITORIA.tipo,
  opciones: TIPOS_EVENTO_AUDITORIA.map((tipo) => ({ valor: tipo, etiqueta: ETIQUETAS_TIPO_AUDITORIA[tipo] })),
};

/** Auditoría del tenant con filtros en la URL y franja de integridad (spec 20c, TR-RF-086; pantalla tipo «Lista»). */
@Component({
  selector: 'vit-auditoria-lista',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    SiPermisoDirective,
    AccionesFilaDirective,
    CargandoComponent,
    FiltrosComponent,
    TablaComponent,
    FranjaIntegridadComponent,
  ],
  providers: [
    provideNativeDateAdapter(),
    { provide: DateAdapter, useClass: AdaptadorFechaPeru },
    { provide: MAT_DATE_LOCALE, useValue: LOCALE_PERU },
    { provide: MatDatepickerIntl, useClass: CalendarioEnEspanol },
  ],
  templateUrl: './auditoria-lista.page.html',
})
export class AuditoriaListaPage {
  private readonly auditoria = inject(AuditoriaCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly sesion = inject(SesionService);
  private readonly avisos = inject(AvisosService);
  private readonly rutaMfa = inject(CONFIG_AUTH).rutas?.mfa;
  private readonly documento = inject(DOCUMENT);

  protected readonly mensajes = MENSAJES_AUDITORIA;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS;
  protected readonly filtros = this.definicionesDeFiltros();
  protected readonly exportando = signal(false);

  protected readonly filtro = signal<FiltroAuditoria>(filtroAuditoriaDesdeUrl(this.ruta.snapshot.queryParamMap, new Date()));
  /** `vit-filtros` lo lee una vez al iniciar: la búsqueda, el tipo y la sucursal que traía la URL. */
  protected readonly valorInicialFiltros = valorDeFiltros(this.filtro());
  protected readonly rango = new FormGroup({
    desde: new FormControl<Date | null>(desdeFecha(this.filtro().desde)),
    hasta: new FormControl<Date | null>(desdeFecha(this.filtro().hasta)),
  });
  protected readonly accion = new FormControl(this.filtro().accion ?? '', { nonNullable: true });
  protected readonly filtroEntidad = computed(() => textoEntidad(this.filtro()));
  protected readonly estadoRetorno = computed(() => ({ [ESTADO_RETORNO_AUDITORIA]: this.router.url }));
  protected readonly listado = signal<Listado<FilaAuditoria>>({ items: [], total: 0 });
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly franja = signal<EstadoFranja>({ tipo: 'cargando' });
  /** Solo se pinta la respuesta de la última consulta: un filtro rápido no la pisa con una vieja. */
  private consultaActual = 0;

  constructor() {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed()).subscribe((parametros) => {
      this.filtro.set(filtroAuditoriaDesdeUrl(parametros, new Date()));
      this.accion.setValue(this.filtro().accion ?? '', { emitEvent: false });
      void this.cargar();
    });
    void this.cargarFranja();
  }

  /** Solo con las dos fechas: el selector emite al elegir la primera. */
  protected cambiarRango(): void {
    const { desde, hasta } = this.rango.getRawValue();
    if (!desde || !hasta) return;
    this.navegar({ desde: fechaCalendario(desde), hasta: fechaCalendario(hasta) });
  }

  protected filtrar(valor: ValorFiltros): void {
    const usuario = valor.busqueda.trim();
    this.navegar({
      tipo: (valor[PARAMETRO_URL_AUDITORIA.tipo] as TipoEventoAuditoria | null) ?? undefined,
      sucursalId: valor[PARAMETRO_URL_AUDITORIA.sucursalId] ?? undefined,
      usuario: usuario.length >= LONGITUD_MINIMA_USUARIO ? usuario : undefined,
    });
  }

  /** Con Enter o al salir del campo; si no cambió, no vuelve a pedir. */
  protected aplicarAccion(): void {
    const accion = accionNormalizada(this.accion.value);
    if (accion === this.filtro().accion) return;
    this.navegar({ accion });
  }

  protected quitarFiltroEntidad(): void {
    this.navegar({ entidadTipo: undefined, entidadId: undefined });
  }

  protected quitarFiltroTitular(): void {
    this.navegar({ personaTitularId: undefined });
  }

  protected paginar({ indice, tamano }: CambioPagina): void {
    this.navegar({ pagina: indice + 1, tamano }, false);
  }

  /** Los filtros aplicados (los de la URL), sin la página. Sin MFA reciente, primero la verificación. */
  protected async exportar(): Promise<void> {
    if (this.exportando()) return;
    if (!this.sesion.contexto()?.mfaVigente) {
      await this.irAVerificarMfa();
      return;
    }
    const { pagina: _pagina, tamano: _tamano, ...filtroExportacion } = this.filtro();
    this.exportando.set(true);
    let fallo: ErrorAdmin | null = null;
    try {
      const { archivo, nombre } = await this.auditoria.exportar(filtroExportacion);
      descargarArchivo(this.documento, archivo, nombre);
    } catch (error) {
      fallo = aErrorAdmin(error);
    } finally {
      this.exportando.set(false);
    }
    // Después de quitar «Exportando…»: el aviso queda abierto hasta que lo cierran.
    if (fallo) await this.avisarErrorDeExportacion(fallo);
  }

  /** El MFA pudo vencer entre la carga del contexto y el clic: el mismo camino que sin MFA. */
  private async avisarErrorDeExportacion(error: ErrorAdmin): Promise<void> {
    if (error.codigo === CODIGO_MFA_REQUERIDA) {
      await this.irAVerificarMfa();
      return;
    }
    await this.avisos.error(MENSAJES_AUDITORIA.tituloErrorExportar, error.message);
  }

  private async irAVerificarMfa(): Promise<void> {
    if (!this.rutaMfa) return;
    await this.router.navigate([this.rutaMfa], { queryParams: { [PARAMETRO_RETORNO]: this.router.url } });
  }

  /** Todo cambio de filtro vuelve a la página 1; paginar no. */
  private navegar(cambios: Partial<FiltroAuditoria>, aPrimeraPagina = true): void {
    const filtro = { ...this.filtro(), ...(aPrimeraPagina ? { pagina: 1 } : {}), ...cambios };
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: filtroAuditoriaParaUrl(filtro) });
  }

  private async cargar(): Promise<void> {
    const consulta = ++this.consultaActual;
    this.cargando.set(true);
    this.error.set(null);
    try {
      const listado = await this.auditoria.listar(this.filtro());
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

  /** Una vez por entrada: el resultado no depende de los filtros. 403 (sin alcance TENANT) u otro error la ocultan. */
  private async cargarFranja(): Promise<void> {
    try {
      const verificacion = await this.auditoria.ultimaVerificacion();
      this.franja.set(verificacion ? { tipo: 'verificada', verificacion } : { tipo: 'sin-verificar' });
    } catch {
      this.franja.set({ tipo: 'oculta' });
    }
  }

  private definicionesDeFiltros(): DefinicionFiltro[] {
    const sucursales = this.sesion.contexto()?.sucursales ?? [];
    const definicionSucursal: DefinicionFiltro = {
      clave: PARAMETRO_URL_AUDITORIA.sucursalId,
      etiqueta: MENSAJES_AUDITORIA.sucursal,
      textoTodos: MENSAJES_AUDITORIA.todasLasSucursales,
      opciones: sucursales.map((sucursal) => ({ valor: sucursal.id, etiqueta: `${sucursal.codigo} · ${sucursal.nombre}` })),
    };
    return [DEFINICION_TIPO, definicionSucursal];
  }
}

function filaDe(evento: EventoAuditoria): FilaAuditoria {
  return {
    id: evento.id,
    fecha: formatearFechaHora(evento.ocurridoEn),
    tipo: ETIQUETAS_TIPO_AUDITORIA[evento.tipo],
    tonoTipo: TONOS_TIPO_AUDITORIA[evento.tipo],
    accion: evento.accion,
    entidad: `${evento.entidadTipo} · ${evento.entidadId}`,
    usuario: evento.usuario?.nombre ?? MENSAJES_AUDITORIA.sistema,
    sucursal: evento.sucursal?.codigo ?? MENSAJES_AUDITORIA.todoElTenant,
  };
}

/** «venta · V-000981», o solo la parte que trae la URL; `null` sin filtro de entidad. */
function textoEntidad(filtro: FiltroAuditoria): string | null {
  const partes = [filtro.entidadTipo, filtro.entidadId].filter((parte): parte is string => Boolean(parte));
  return partes.length > 0 ? partes.join(' · ') : null;
}

function valorDeFiltros(filtro: FiltroAuditoria): Record<string, string | null> {
  return {
    busqueda: filtro.usuario ?? '',
    [PARAMETRO_URL_AUDITORIA.tipo]: filtro.tipo ?? null,
    [PARAMETRO_URL_AUDITORIA.sucursalId]: filtro.sucursalId ?? null,
  };
}

/** `YYYY-MM-DD` como medianoche local: el selector trabaja en la zona del navegador. */
function desdeFecha(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}
