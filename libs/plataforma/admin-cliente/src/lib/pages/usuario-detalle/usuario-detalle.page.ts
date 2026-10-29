import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService, CargandoComponent } from '@vitrina/shared/ui';
import { aErrorAdmin } from '../../models/error-admin';
import type { EstadoReenvio } from '../../models/invitacion';
import {
  CONFIRMACIONES,
  ETIQUETAS_ALCANCE,
  ETIQUETAS_ESTADO_ASIGNACION,
  ETIQUETAS_ESTADO_MEMBRESIA,
  MENSAJES_ADMIN,
  MENSAJES_DETALLE,
} from '../../models/mensajes-admin';
import type { AsignacionDelMiembro, EstadoMembresia, MiembroDetalle } from '../../models/miembro';
import { PERMISOS_ADMIN } from '../../models/permisos-admin';
import { AsignacionesCliente } from '../../services/asignaciones.cliente';
import { MembresiasCliente, type AccionMembresia } from '../../services/membresias.cliente';
import { MiembrosCliente } from '../../services/miembros.cliente';
import { formatearFecha, formatearFechaHora } from '../../utils/formato';

/** SEG valida el motivo de 4 a 300 caracteres: TR-CA-039 usa «Cese» (D1 del spec 16a). */
export const LONGITUD_MINIMA_MOTIVO_SEG = 4;

const PARAMETRO_MEMBRESIA = 'membresiaId';
const COLUMNAS_ASIGNACIONES = ['rolOPerfil', 'alcance', 'vigencia', 'estado', 'acciones'];

/** Qué puede hacerse con la membresía según su estado (spec 08). Revocar va por asignación. */
const ACCIONES_POR_ESTADO: Readonly<Record<EstadoMembresia, { ciclo: AccionMembresia[]; asignar: boolean; reenviar: boolean }>> = {
  ACTIVO: { ciclo: ['suspender', 'finalizar'], asignar: true, reenviar: false },
  SUSPENDIDO: { ciclo: ['reactivar', 'finalizar'], asignar: false, reenviar: false },
  INVITADO: { ciclo: ['finalizar'], asignar: true, reenviar: true },
  FINALIZADO: { ciclo: [], asignar: false, reenviar: true },
};

/** Una asignación vencida o revocada ya no se revoca. */
const ESTADOS_REVOCABLES: ReadonlySet<AsignacionDelMiembro['estado']> = new Set(['VIGENTE', 'FUTURA']);

/** Detalle del miembro con sus asignaciones y las acciones de TR-RF-013 y 014 (U-03). */
@Component({
  selector: 'vit-usuario-detalle',
  imports: [MatButtonModule, MatTableModule, RouterLink, SiPermisoDirective, CargandoComponent],
  templateUrl: './usuario-detalle.page.html',
})
export class UsuarioDetallePage {
  private readonly miembros = inject(MiembrosCliente);
  private readonly membresias = inject(MembresiasCliente);
  private readonly asignaciones = inject(AsignacionesCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly membresiaId = this.ruta.snapshot.paramMap.get(PARAMETRO_MEMBRESIA) ?? '';

  protected readonly mensajes = MENSAJES_DETALLE;
  protected readonly textoSinFecha = MENSAJES_ADMIN.sinFecha;
  protected readonly permisos = PERMISOS_ADMIN;
  protected readonly columnas = COLUMNAS_ASIGNACIONES;
  protected readonly etiquetasCiclo: Readonly<Record<AccionMembresia, string>> = {
    suspender: MENSAJES_DETALLE.suspender,
    reactivar: MENSAJES_DETALLE.reactivar,
    finalizar: MENSAJES_DETALLE.finalizar,
  };

  protected readonly miembro = signal<MiembroDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  protected readonly acciones = computed(() => {
    const miembro = this.miembro();
    return miembro ? ACCIONES_POR_ESTADO[miembro.estado] : null;
  });

  constructor() {
    void this.cargar();
  }

  protected etiquetaEstado(miembro: MiembroDetalle): string {
    return ETIQUETAS_ESTADO_MEMBRESIA[miembro.estado];
  }

  protected vencimientoInvitacion(miembro: MiembroDetalle): string | null {
    return miembro.invitacionExpiraEn ? formatearFechaHora(miembro.invitacionExpiraEn) : null;
  }

  protected nombreAsignado(asignacion: AsignacionDelMiembro): string {
    if (asignacion.rol) return asignacion.rol.nombre;
    return `${MENSAJES_DETALLE.perfil} ${asignacion.perfil?.nombre ?? ''}`.trim();
  }

  protected alcance(asignacion: AsignacionDelMiembro): string {
    const ubicacion = asignacion.unidad ?? asignacion.sucursal ?? asignacion.empresa;
    return ubicacion ? `${ETIQUETAS_ALCANCE[asignacion.alcance]}: ${ubicacion.nombre}` : ETIQUETAS_ALCANCE[asignacion.alcance];
  }

  protected vigencia(asignacion: AsignacionDelMiembro): string {
    const hasta = asignacion.vigenteHasta ? formatearFecha(asignacion.vigenteHasta) : MENSAJES_DETALLE.sinFin;
    return `${formatearFecha(asignacion.vigenteDesde)} – ${hasta}`;
  }

  protected estadoAsignacion(asignacion: AsignacionDelMiembro): string {
    return ETIQUETAS_ESTADO_ASIGNACION[asignacion.estado];
  }

  protected esRevocable(asignacion: AsignacionDelMiembro): boolean {
    return ESTADOS_REVOCABLES.has(asignacion.estado);
  }

  protected async ejecutarCiclo(accion: AccionMembresia): Promise<void> {
    const miembro = this.miembro();
    if (!miembro) return;
    const confirmacion = CONFIRMACIONES[accion];
    await this.accionConMotivo(confirmacion.titulo(miembro.nombre), confirmacion.texto, this.etiquetasCiclo[accion], confirmacion.hecho, (motivo) =>
      this.membresias.ejecutar(accion, miembro.membresiaId, motivo),
    );
  }

  protected async revocar(asignacion: AsignacionDelMiembro): Promise<void> {
    const { titulo, texto, hecho } = CONFIRMACIONES.revocar;
    await this.accionConMotivo(titulo(this.nombreAsignado(asignacion)), texto, MENSAJES_DETALLE.revocar, hecho, (motivo) =>
      this.asignaciones.revocar(asignacion.id, motivo),
    );
  }

  protected async asignar(): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    await this.router.navigate(['asignar'], { relativeTo: this.ruta });
  }

  protected reenviarInvitacion(): void {
    const miembro = this.miembro();
    if (!miembro) return;
    const estado: EstadoReenvio = { reenviar: { nombre: miembro.nombre, correo: miembro.correo } };
    void this.router.navigate(['..', 'invitar'], { relativeTo: this.ruta, state: estado });
  }

  /** TR-RNF-021: MFA reciente, confirmación con motivo y `confirmar: true`; luego se recarga el detalle. */
  private async accionConMotivo(titulo: string, texto: string, textoConfirmar: string, hecho: string, ejecutar: (motivo: string) => Promise<unknown>): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    const respuesta = await this.avisos.confirmarDestructiva({ titulo, texto, textoConfirmar, pedirMotivo: true, longitudMinimaMotivo: LONGITUD_MINIMA_MOTIVO_SEG });
    if (!respuesta.confirmado || respuesta.motivo === null) return;

    this.ocupado.set(true);
    this.error.set(null);
    try {
      await ejecutar(respuesta.motivo);
      this.avisos.toast('exito', hecho);
      await this.cargar();
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  private async cargar(): Promise<void> {
    try {
      this.miembro.set(await this.miembros.detalle(this.membresiaId));
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    }
  }
}
