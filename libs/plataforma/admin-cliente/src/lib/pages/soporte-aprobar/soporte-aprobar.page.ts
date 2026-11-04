import { Component, inject, signal, type OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, MensajeValidacionPipe } from '@vitrina/shared/ui';
import { HORAS_SOPORTE, type SolicitudSoporte } from '../../models/acceso-soporte';
import type { Asignables } from '../../models/asignable';
import { aErrorAdmin } from '../../models/error-admin';
import { ETIQUETAS_MODO_SOPORTE, etiquetaHoras, MENSAJES_SOPORTE, mensajeAprobadoHasta } from '../../models/mensajes-soporte';
import { AsignacionesCliente } from '../../services/asignaciones.cliente';
import { InsigniasSoporteService } from '../../services/insignias-soporte.service';
import { SoporteCliente } from '../../services/soporte.cliente';
import { formatearFechaHora } from '../../utils/formato';
import { PREFIJO_PERFIL, PREFIJO_ROL } from '../../utils/formulario-asignacion';

const PARAMETRO_ACCESO = 'accesoId';
/** La API pagina hasta 100: las pendientes de un tenant caben de sobra en una página. */
const TAMANO_PENDIENTES = 100;
const FORMATO_HORA_LIMA = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function idConPrefijo(valor: string, prefijo: string): string | null {
  return valor.startsWith(prefijo) ? valor.slice(prefijo.length) : null;
}

/**
 * Aprobar una solicitud: horas de 1 a 4 (por defecto, las pedidas) y el rol o perfil del agente
 * (spec 18, TR-RF-020 paso 2; pantalla tipo «Formulario»). La API valida el techo y TR-CA-054.
 */
@Component({
  selector: 'vit-soporte-aprobar',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatSelectModule, RouterLink, AccionesFormularioComponent, CargandoComponent, MensajeValidacionPipe],
  templateUrl: './soporte-aprobar.page.html',
})
export class SoporteAprobarPage implements OnInit {
  private readonly soporte = inject(SoporteCliente);
  private readonly asignaciones = inject(AsignacionesCliente);
  private readonly insignias = inject(InsigniasSoporteService);
  private readonly avisos = inject(AvisosService);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly accesoId = this.ruta.snapshot.paramMap.get(PARAMETRO_ACCESO) ?? '';

  protected readonly mensajes = MENSAJES_SOPORTE;
  protected readonly etiquetasModo = ETIQUETAS_MODO_SOPORTE;
  protected readonly horasPosibles = HORAS_SOPORTE;
  protected readonly etiquetaHoras = etiquetaHoras;
  protected readonly prefijoRol = PREFIJO_ROL;
  protected readonly prefijoPerfil = PREFIJO_PERFIL;
  protected readonly formatearFechaHora = formatearFechaHora;

  protected readonly solicitud = signal<SolicitudSoporte | null>(null);
  protected readonly asignables = signal<Asignables>({ roles: [], perfiles: [] });
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = new FormGroup({
    horas: new FormControl<number>(HORAS_SOPORTE[0], { nonNullable: true, validators: [Validators.required] }),
    asignable: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    void this.cargar();
  }

  protected async aprobar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    if (!(await this.accionSensible.exigirMfa())) return;
    const { horas, asignable } = this.formulario.getRawValue();
    this.guardando.set(true);
    this.error.set(null);
    try {
      const aprobado = await this.soporte.aprobar(this.accesoId, {
        horas,
        rolId: idConPrefijo(asignable, PREFIJO_ROL),
        perfilId: idConPrefijo(asignable, PREFIJO_PERFIL),
      });
      this.avisos.toast('exito', mensajeAprobadoHasta(FORMATO_HORA_LIMA.format(aprobado.hasta)));
      void this.insignias.actualizar();
      await this.volverALista();
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.volverALista();
  }

  private volverALista(): Promise<boolean> {
    return this.router.navigate(['../..'], { relativeTo: this.ruta });
  }

  private async cargar(): Promise<void> {
    try {
      const [pendientes, asignables] = await Promise.all([this.soporte.listar({ vista: 'pendientes', pagina: 1, tamano: TAMANO_PENDIENTES }), this.asignaciones.asignables()]);
      const solicitud = pendientes.items.find((pendiente) => pendiente.id === this.accesoId) ?? null;
      this.asignables.set(asignables);
      this.solicitud.set(solicitud);
      if (!solicitud) {
        this.error.set(MENSAJES_SOPORTE.noPendiente);
        return;
      }
      this.formulario.controls.horas.setValue(solicitud.horasSolicitadas);
    } catch (error) {
      this.error.set(aErrorAdmin(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
