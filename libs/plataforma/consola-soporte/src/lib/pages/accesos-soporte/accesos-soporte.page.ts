import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AccionesFilaDirective,
  filasDePagina,
  TablaComponent,
  TAMANO_PAGINA_POR_DEFECTO,
  type CambioPagina,
  type ColumnaTabla,
  type TonoEstado,
} from '@vitrina/shared/ui';
import { DATO_URL_ADMINISTRACION } from '../../config/url-administracion';
import { esVigente, type AccesoDelAgente } from '../../models/acceso-del-agente';
import { aErrorSoporte } from '../../models/error-soporte';
import { COLUMNAS_SOPORTE, ETIQUETAS_ESTADO_SOPORTE, ETIQUETAS_MODO_SOPORTE, MENSAJES_SOPORTE, TONOS_ESTADO_SOPORTE } from '../../models/mensajes-soporte';
import { EntradaSoporteService } from '../../services/entrada-soporte.service';
import { SoporteAgenteCliente } from '../../services/soporte-agente.cliente';
import { formatearFechaHora } from '../../utils/formato';

/** Lo que muestra cada celda, ya como texto. */
export interface FilaAcceso {
  id: string;
  tenant: string;
  ticket: string;
  modo: string;
  estado: string;
  tonoEstado: TonoEstado;
  fin: string;
  vigente: boolean;
}

const PRIMERA_PAGINA: CambioPagina = { indice: 0, tamano: TAMANO_PAGINA_POR_DEFECTO };

const COLUMNAS: ColumnaTabla<FilaAcceso>[] = [
  { clave: 'tenant', titulo: COLUMNAS_SOPORTE.tenant, movil: 'titulo' },
  { clave: 'ticket', titulo: COLUMNAS_SOPORTE.ticket, movil: 'detalle' },
  { clave: 'modo', titulo: COLUMNAS_SOPORTE.modo },
  { clave: 'estado', titulo: COLUMNAS_SOPORTE.estado, movil: 'estado', tono: (fila) => fila.tonoEstado },
  { clave: 'fin', titulo: COLUMNAS_SOPORTE.fin },
];

/** «Mis accesos» del agente en todos los tenants (spec 18, TR-RF-020; pantalla tipo «Lista»). */
@Component({
  selector: 'vit-accesos-soporte',
  imports: [MatButtonModule, MatIconModule, RouterLink, AccionesFilaDirective, TablaComponent],
  templateUrl: './accesos-soporte.page.html',
})
export class AccesosSoportePage implements OnInit {
  private readonly soporte = inject(SoporteAgenteCliente);
  private readonly entrada = inject(EntradaSoporteService);
  private readonly urlAdministracion: string = inject(ActivatedRoute).snapshot.data[DATO_URL_ADMINISTRACION] ?? '';

  protected readonly mensajes = MENSAJES_SOPORTE;
  protected readonly columnas = COLUMNAS;
  protected readonly filas = signal<FilaAcceso[]>([]);
  /** La API trae los 50 más recientes de una vez: se pagina en el navegador. */
  protected readonly paginaActual = signal<CambioPagina>(PRIMERA_PAGINA);
  protected readonly filasVisibles = computed(() => filasDePagina(this.filas(), this.paginaActual()));
  protected readonly cargando = signal(true);
  protected readonly entrando = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.cargar();
  }

  protected paginar(cambio: CambioPagina): void {
    this.paginaActual.set(cambio);
  }

  protected async entrar(fila: FilaAcceso): Promise<void> {
    this.entrando.set(true);
    this.error.set(null);
    try {
      await this.entrada.entrar(fila.id, this.urlAdministracion);
    } catch (error) {
      this.error.set(aErrorSoporte(error).message);
      this.entrando.set(false);
    }
  }

  private async cargar(): Promise<void> {
    try {
      const ahora = new Date();
      this.filas.set((await this.soporte.misAccesos()).map((acceso) => filaDe(acceso, ahora)));
    } catch (error) {
      this.error.set(aErrorSoporte(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}

function filaDe(acceso: AccesoDelAgente, ahora: Date): FilaAcceso {
  return {
    id: acceso.id,
    tenant: acceso.tenantNombre,
    ticket: acceso.ticket,
    modo: ETIQUETAS_MODO_SOPORTE[acceso.modo],
    estado: ETIQUETAS_ESTADO_SOPORTE[acceso.estado],
    tonoEstado: TONOS_ESTADO_SOPORTE[acceso.estado],
    fin: acceso.hasta ? formatearFechaHora(acceso.hasta) : MENSAJES_SOPORTE.sinDato,
    vigente: esVigente(acceso, ahora),
  };
}
