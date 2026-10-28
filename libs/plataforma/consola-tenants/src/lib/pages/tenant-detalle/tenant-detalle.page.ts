import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { TRANSICIONES_TENANT } from '../../models/catalogos';
import { aErrorConsola } from '../../models/error-consola';
import { CONFIRMACIONES_ESTADO, ETIQUETAS_ESTADO_TENANT, MENSAJES_DETALLE } from '../../models/mensajes-consola';
import { PERMISOS_CONSOLA } from '../../models/permisos-consola';
import type { TenantDetalle } from '../../models/tenant';
import { TenantsCliente } from '../../services/tenants.cliente';
import { formatearFechaCalendario, formatearFechaHora } from '../../utils/formato';

type DestinoEstado = keyof typeof CONFIRMACIONES_ESTADO;

const PARAMETRO_TENANT = 'id';
const CODIGO_NO_ENCONTRADO = 'NO_ENCONTRADO';

/** Detalle del tenant con suscripciones, empresa principal, historial y cambio de estado (TR-RF-006). */
@Component({
  selector: 'vit-tenant-detalle',
  imports: [MatButtonModule, RouterLink, SiPermisoDirective, CargandoComponent, EstadoVacioComponent],
  templateUrl: './tenant-detalle.page.html',
})
export class TenantDetallePage {
  private readonly tenants = inject(TenantsCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly tenantId = inject(ActivatedRoute).snapshot.paramMap.get(PARAMETRO_TENANT) ?? '';

  protected readonly mensajes = MENSAJES_DETALLE;
  protected readonly permisos = PERMISOS_CONSOLA;
  protected readonly confirmaciones = CONFIRMACIONES_ESTADO;
  protected readonly etiquetasEstado = ETIQUETAS_ESTADO_TENANT;
  protected readonly formatearFechaHora = formatearFechaHora;
  protected readonly formatearFechaCalendario = formatearFechaCalendario;

  protected readonly tenant = signal<TenantDetalle | null>(null);
  protected readonly noExiste = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly ocupado = signal(false);
  /** TR-RN-005: solo los destinos válidos desde el estado actual; en BAJA, ninguno. */
  protected readonly destinos = computed(() => {
    const tenant = this.tenant();
    return tenant ? (TRANSICIONES_TENANT[tenant.estado] as readonly DestinoEstado[]) : [];
  });

  constructor() {
    void this.cargar();
  }

  /** TR-RNF-021: MFA vigente, confirmación con motivo (mínimo 10, como ORG) y recarga del detalle. */
  protected async cambiarEstado(destino: DestinoEstado): Promise<void> {
    const tenant = this.tenant();
    if (!tenant) return;
    if (!(await this.accionSensible.exigirMfa())) return;
    const confirmacion = this.confirmaciones[destino];
    const respuesta = await this.avisos.confirmarDestructiva({
      titulo: confirmacion.titulo(tenant.codigo),
      texto: confirmacion.texto,
      textoConfirmar: confirmacion.boton,
      pedirMotivo: true,
    });
    if (!respuesta.confirmado || respuesta.motivo === null) return;

    this.ocupado.set(true);
    this.error.set(null);
    try {
      const resultado = await this.tenants.cambiarEstado(tenant.id, { estado: destino, motivo: respuesta.motivo });
      this.avisos.toast(resultado.cambiado ? 'exito' : 'info', resultado.cambiado ? confirmacion.hecho : MENSAJES_DETALLE.yaEstaba);
      await this.cargar();
    } catch (error) {
      this.error.set(aErrorConsola(error).message);
    } finally {
      this.ocupado.set(false);
    }
  }

  private async cargar(): Promise<void> {
    try {
      this.tenant.set(await this.tenants.consultar(this.tenantId));
    } catch (error) {
      const errorConsola = aErrorConsola(error);
      if (errorConsola.codigo === CODIGO_NO_ENCONTRADO) {
        this.noExiste.set(true);
        return;
      }
      this.error.set(errorConsola.message);
    }
  }
}
