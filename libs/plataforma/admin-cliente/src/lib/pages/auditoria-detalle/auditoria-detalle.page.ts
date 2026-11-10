import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink, type UrlTree } from '@angular/router';
import { CargandoComponent, ChipEstadoComponent } from '@vitrina/shared/ui';
import { aErrorAdmin, CODIGO_NO_ENCONTRADO } from '../../models/error-admin';
import type { CambioAuditoria, EventoAuditoriaDetalle } from '../../models/evento-auditoria';
import { ETIQUETAS_FINALIDAD, ETIQUETAS_TIPO_AUDITORIA, MENSAJES_AUDITORIA, TONOS_TIPO_AUDITORIA } from '../../models/mensajes-auditoria';
import { AuditoriaCliente } from '../../services/auditoria.cliente';
import { formatearFechaHora } from '../../utils/formato';
import { ESTADO_RETORNO_AUDITORIA } from '../../utils/filtro-url-auditoria';
import { textoDeValor } from '../../utils/valor-cambio';

const PARAMETRO_EVENTO = 'eventoId';
/** Tope de `cambios` de la API (spec 20b): con exactamente este número, la lista pudo quedar recortada. */
const MAXIMO_CAMBIOS = 200;
const ESTADO_HTTP_NO_ENCONTRADO = 404;
const SANGRIA_JSON = 2;

/** Un cambio ya como texto plano (no se interpreta HTML). */
export interface CambioLegible {
  campo: string;
  antes: string;
  despues: string;
}

/** Un dato opcional del evento: solo se muestra si tiene valor. */
export interface DatoOpcional {
  clave: string;
  etiqueta: string;
  valor: string;
}

/** Detalle de un evento de auditoría con sus cambios (spec 20c, TR-RF-086; pantalla tipo «Detalle», solo lectura). */
@Component({
  selector: 'vit-auditoria-detalle',
  imports: [MatButtonModule, MatExpansionModule, MatIconModule, RouterLink, CargandoComponent, ChipEstadoComponent],
  templateUrl: './auditoria-detalle.page.html',
})
export class AuditoriaDetallePage implements OnInit {
  private readonly auditoria = inject(AuditoriaCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly eventoId = this.ruta.snapshot.paramMap.get(PARAMETRO_EVENTO) ?? '';

  protected readonly mensajes = MENSAJES_AUDITORIA;
  /** La lista con los filtros con que se entró; si se llegó por enlace directo, la lista sola. */
  protected readonly volverA: UrlTree = this.urlDeRetorno();
  protected readonly evento = signal<EventoAuditoriaDetalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly fecha = computed(() => {
    const evento = this.evento();
    return evento ? formatearFechaHora(evento.ocurridoEn) : '';
  });
  protected readonly etiquetaTipo = computed(() => {
    const evento = this.evento();
    return evento ? ETIQUETAS_TIPO_AUDITORIA[evento.tipo] : '';
  });
  protected readonly tonoTipo = computed(() => TONOS_TIPO_AUDITORIA[this.evento()?.tipo ?? 'OPERACION']);
  protected readonly opcionales = computed(() => datosOpcionales(this.evento()));
  protected readonly cambios = computed(() => (this.evento()?.cambios ?? []).map(cambioLegible));
  protected readonly cambiosRecortados = computed(() => this.cambios().length >= MAXIMO_CAMBIOS);
  protected readonly jsonAntes = computed(() => jsonLegible(this.evento()?.antes));
  protected readonly jsonDespues = computed(() => jsonLegible(this.evento()?.despues));

  ngOnInit(): void {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.evento.set(await this.auditoria.detalle(this.eventoId));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Solo se acepta una URL de la propia lista: el `state` de la navegación no se usa para ir a otro lado. */
  private urlDeRetorno(): UrlTree {
    const lista = this.router.createUrlTree(['..'], { relativeTo: this.ruta });
    const retorno: unknown = this.router.currentNavigation()?.extras.state?.[ESTADO_RETORNO_AUDITORIA];
    if (typeof retorno !== 'string') return lista;
    const destino = this.router.parseUrl(retorno);
    const rutaDestino = this.router.serializeUrl(destino).split('?')[0];
    return rutaDestino === this.router.serializeUrl(lista) ? destino : lista;
  }
}

function mensajeDeError(error: unknown): string {
  const errorAdmin = aErrorAdmin(error);
  const noEncontrado = errorAdmin.estado === ESTADO_HTTP_NO_ENCONTRADO || errorAdmin.codigo === CODIGO_NO_ENCONTRADO;
  return noEncontrado ? MENSAJES_AUDITORIA.eventoNoEncontrado : errorAdmin.message;
}

function cambioLegible(cambio: CambioAuditoria): CambioLegible {
  return { campo: cambio.campo, antes: textoDeValor(cambio.antes), despues: textoDeValor(cambio.despues) };
}

function jsonLegible(valor: unknown): string {
  return valor === null || valor === undefined ? MENSAJES_AUDITORIA.sinDato : JSON.stringify(valor, null, SANGRIA_JSON);
}

function datosOpcionales(evento: EventoAuditoriaDetalle | null): DatoOpcional[] {
  if (!evento) return [];
  const candidatos: { clave: string; etiqueta: string; valor: string | null }[] = [
    { clave: 'motivo', etiqueta: MENSAJES_AUDITORIA.motivo, valor: evento.motivo },
    { clave: 'finalidad', etiqueta: MENSAJES_AUDITORIA.finalidad, valor: evento.finalidad ? ETIQUETAS_FINALIDAD[evento.finalidad] : null },
    { clave: 'ticket', etiqueta: MENSAJES_AUDITORIA.ticket, valor: evento.ticket },
    { clave: 'titular', etiqueta: MENSAJES_AUDITORIA.titular, valor: evento.personaTitularId },
    { clave: 'ip', etiqueta: MENSAJES_AUDITORIA.ip, valor: evento.ip },
  ];
  return candidatos.filter((candidato): candidato is DatoOpcional => Boolean(candidato.valor));
}
