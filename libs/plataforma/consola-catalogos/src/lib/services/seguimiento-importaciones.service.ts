import { effect, inject, Injectable } from '@angular/core';
import { SesionService } from '@vitrina/shared/auth';
import { TareasEnCursoService } from '@vitrina/shared/shell';
import { AvisosService } from '@vitrina/shared/ui';
import { Subject, type Observable, type Subscription } from 'rxjs';
import { ESTADOS_FINALES_APLICACION, type AvisoImportacion, type DetalleImportacion, type EstadoFinalAplicacion } from '../models/importacion';
import {
  mensajeAplicando,
  mensajeImportacionAplicada,
  mensajeImportacionFallida,
  mensajeImportacionObsoleta,
  mensajeSeguimientoPerdido,
  MENSAJES_SEGUIMIENTO,
  mensajeTituloImportando,
} from '../models/mensajes-catalogos';
import { PERMISOS_CATALOGOS } from '../models/permisos-catalogos';
import { StreamRechazado, EventosImportacionCliente } from './eventos-importacion.cliente';
import { ImportacionesCliente } from './importaciones.cliente';

/** Espera entre reintentos del `GET` de recuperación cuando ese `GET` falla. */
export const ESPERA_RECONEXION_MS = 5000;
export const REINTENTOS_MAXIMOS = 3;
const HTTP_NO_ENCONTRADO = 404;
const ESTADOS_EN_CURSO: readonly string[] = ['EN_COLA', 'EN_PROCESO'];
const RUTA_CATALOGOS = '/consola/catalogos';
const PESTANA_IMPORTACIONES = 'pestana=importaciones';

type AvisoDeFin = Extract<AvisoImportacion, { tipo: 'fin' }>;
type AvisoDeAvance = Extract<AvisoImportacion, { tipo: 'avance' }>;

interface Seguimiento {
  codigo: string;
  suscripcion: Subscription | null;
  espera: ReturnType<typeof setTimeout> | null;
  fallosSeguidos: number;
}

/**
 * Seguimiento global de las importaciones del usuario (spec 19d). Vive en raíz: el usuario sigue navegando
 * mientras el worker aplica. Abre un stream por importación, la muestra en la barra y avisa con un toast al
 * terminar. Si el stream se corta, un solo `GET` del estado decide; sin polling periódico.
 */
@Injectable({ providedIn: 'root' })
export class SeguimientoImportacionesService {
  private readonly sesion = inject(SesionService);
  private readonly importaciones = inject(ImportacionesCliente);
  private readonly eventos = inject(EventosImportacionCliente);
  private readonly tareas = inject(TareasEnCursoService);
  private readonly avisos = inject(AvisosService);
  private readonly seguimientos = new Map<string, Seguimiento>();
  private readonly terminadasInterno = new Subject<string>();
  private activasRecuperadas = false;

  /** Id de cada importación que terminó; el detalle abierto recarga su historial y sus ítems. */
  readonly terminadas: Observable<string> = this.terminadasInterno.asObservable();

  constructor() {
    effect(() => {
      const contexto = this.sesion.contexto();
      if (!this.sesion.autenticado() || !contexto) {
        this.detenerTodo();
        return;
      }
      // `importar` es sensible: con el MFA vencido la API responde 401 MFA_REQUERIDA y el interceptor llevaría
      // a verificar desde cualquier pantalla. Se espera a que el contexto diga que el MFA está vigente.
      if (contexto.mfaVigente && this.sesion.tiene(PERMISOS_CATALOGOS.importar)) void this.recuperarActivas();
    });
  }

  /** Idempotente: si ya sigue esa importación, no abre otro stream. */
  seguir(importacionId: string, codigoCatalogo: string): void {
    if (this.seguimientos.has(importacionId)) return;
    this.seguimientos.set(importacionId, { codigo: codigoCatalogo, suscripcion: null, espera: null, fallosSeguidos: 0 });
    this.tareas.registrar({
      id: importacionId,
      titulo: mensajeTituloImportando(codigoCatalogo),
      avance: null,
      detalle: MENSAJES_SEGUIMIENTO.enCola,
      ruta: rutaDelHistorial(codigoCatalogo),
    });
    this.conectar(importacionId);
  }

  /** Al iniciar sesión o recargar: las que siguen en cola vuelven a la barra. Una vez por sesión. */
  private async recuperarActivas(): Promise<void> {
    if (this.activasRecuperadas) return;
    this.activasRecuperadas = true;
    try {
      for (const activa of await this.importaciones.activas()) {
        this.seguir(activa.id, activa.codigo);
        if (activa.avance !== null) this.mostrarAvance(activa.id, avanceEnProceso(activa.avance));
      }
    } catch {
      this.activasRecuperadas = false;
    }
  }

  private conectar(importacionId: string): void {
    const seguimiento = this.seguimientos.get(importacionId);
    if (!seguimiento) return;
    seguimiento.suscripcion = this.eventos.abrir(importacionId).subscribe({
      next: (aviso) => (aviso.tipo === 'fin' ? this.terminar(importacionId, aviso) : this.mostrarAvance(importacionId, aviso)),
      error: (error: unknown) => this.alCortarse(importacionId, error),
    });
  }

  private mostrarAvance(importacionId: string, aviso: AvisoDeAvance): void {
    if (aviso.estado === 'EN_COLA') {
      this.tareas.actualizar(importacionId, { avance: null, detalle: MENSAJES_SEGUIMIENTO.enCola });
      return;
    }
    this.tareas.actualizar(importacionId, { avance: aviso.avance, detalle: mensajeAplicando(aviso.avance) });
  }

  /** 404: otro usuario o id inexistente, se quita sin aviso. Lo demás, un `GET` del estado decide. */
  private alCortarse(importacionId: string, error: unknown): void {
    if (error instanceof StreamRechazado && error.estado === HTTP_NO_ENCONTRADO) {
      this.olvidar(importacionId);
      return;
    }
    void this.recuperar(importacionId);
  }

  /** El `GET` pasa por el interceptor, que renueva el token: así un 401 del stream se recupera. */
  private async recuperar(importacionId: string): Promise<void> {
    const seguimiento = this.seguimientos.get(importacionId);
    if (!seguimiento) return;
    seguimiento.espera = null;
    let detalle: DetalleImportacion;
    try {
      detalle = await this.importaciones.detalle(importacionId);
    } catch {
      this.reintentarODarPorPerdido(importacionId, seguimiento);
      return;
    }
    if (!this.seguimientos.has(importacionId)) return;
    seguimiento.fallosSeguidos = 0;
    this.continuarSegun(importacionId, detalle);
  }

  private continuarSegun(importacionId: string, detalle: DetalleImportacion): void {
    if (ESTADOS_FINALES_APLICACION.includes(detalle.estado)) {
      this.terminar(importacionId, avisoDeFinDe(detalle));
      return;
    }
    if (!ESTADOS_EN_CURSO.includes(detalle.estado)) {
      this.darPorPerdido(importacionId);
      return;
    }
    if (detalle.estado === 'EN_PROCESO' && detalle.avance !== null) this.mostrarAvance(importacionId, avanceEnProceso(detalle.avance));
    this.conectar(importacionId);
  }

  /** El único temporizador del servicio: la espera entre reintentos del `GET` fallido. */
  private reintentarODarPorPerdido(importacionId: string, seguimiento: Seguimiento): void {
    seguimiento.fallosSeguidos += 1;
    if (seguimiento.fallosSeguidos >= REINTENTOS_MAXIMOS) {
      this.darPorPerdido(importacionId);
      return;
    }
    seguimiento.espera = setTimeout(() => void this.recuperar(importacionId), ESPERA_RECONEXION_MS);
  }

  private darPorPerdido(importacionId: string): void {
    const codigo = this.seguimientos.get(importacionId)?.codigo ?? '';
    this.olvidar(importacionId);
    this.avisos.toast('advertencia', mensajeSeguimientoPerdido(codigo));
  }

  private terminar(importacionId: string, aviso: AvisoDeFin): void {
    const codigo = this.seguimientos.get(importacionId)?.codigo ?? '';
    this.olvidar(importacionId);
    avisarFin(this.avisos, codigo, aviso);
    this.terminadasInterno.next(importacionId);
  }

  private olvidar(importacionId: string): void {
    const seguimiento = this.seguimientos.get(importacionId);
    if (seguimiento?.espera) clearTimeout(seguimiento.espera);
    seguimiento?.suscripcion?.unsubscribe();
    this.seguimientos.delete(importacionId);
    this.tareas.quitar(importacionId);
  }

  /** Sin sesión: se abortan los streams y la barra queda vacía. La próxima sesión vuelve a recuperar. */
  private detenerTodo(): void {
    for (const importacionId of [...this.seguimientos.keys()]) this.olvidar(importacionId);
    this.tareas.vaciar();
    this.activasRecuperadas = false;
  }
}

function avanceEnProceso(avance: number): AvisoDeAvance {
  return { tipo: 'avance', estado: 'EN_PROCESO', avance };
}

function avisoDeFinDe(detalle: DetalleImportacion): AvisoDeFin {
  return { tipo: 'fin', estado: detalle.estado as EstadoFinalAplicacion, resumen: detalle.resumen, motivo: detalle.motivoFallo };
}

function avisarFin(avisos: AvisosService, codigo: string, aviso: AvisoDeFin): void {
  if (aviso.estado === 'APLICADA') {
    avisos.toast('exito', mensajeImportacionAplicada(codigo, aviso.resumen ?? { altas: 0, cambios: 0, bajas: 0 }));
    return;
  }
  if (aviso.estado === 'FALLIDA') {
    avisos.toast('error', mensajeImportacionFallida(codigo, aviso.motivo));
    return;
  }
  avisos.toast('advertencia', mensajeImportacionObsoleta(codigo));
}

function rutaDelHistorial(codigoCatalogo: string): string {
  return `${RUTA_CATALOGOS}/${encodeURIComponent(codigoCatalogo)}?${PESTANA_IMPORTACIONES}`;
}
