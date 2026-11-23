import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  denominacionDe,
  ErrorPersonas,
  ETIQUETAS_ROL,
  ETIQUETAS_TIPO_DOCUMENTO,
  ETIQUETAS_TIPO_PERSONA,
  inicialesDe,
  mensajeDeError,
  PersonaConsentimientosComponent,
  PersonaContactosComponent,
  PersonaDatosBasicosComponent,
  PersonaDireccionesComponent,
  PersonaRolesComponent,
  PersonasCliente,
  TONO_ROL,
  type CambioFicha,
  type PersonaDetalle,
} from '@vitrina/plataforma/personas-ui';
import { AvisosService, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { MENSAJES_PERSONAS_ADMIN } from '../../models/mensajes-personas-admin';

const PARAMETRO_PERSONA = 'personaId';
const CODIGO_NO_ENCONTRADA = 'NO_ENCONTRADA';

/**
 * Ficha de una persona (spec 38): datos básicos, contactos, direcciones, roles y consentimientos. Cada sección
 * avisa su cambio: con la persona nueva se reemplaza sin releer; si pide recargar, se relee y se muestra el aviso.
 */
@Component({
  selector: 'vit-persona-detalle',
  imports: [
    MatIconModule,
    RouterLink,
    CargandoComponent,
    ChipEstadoComponent,
    EstadoVacioComponent,
    PersonaConsentimientosComponent,
    PersonaContactosComponent,
    PersonaDatosBasicosComponent,
    PersonaDireccionesComponent,
    PersonaRolesComponent,
  ],
  templateUrl: './persona-detalle.page.html',
  styleUrl: './persona-detalle.page.css',
})
export class PersonaDetallePage {
  private readonly personas = inject(PersonasCliente);
  private readonly avisos = inject(AvisosService);
  protected readonly personaId = inject(ActivatedRoute).snapshot.paramMap.get(PARAMETRO_PERSONA) ?? '';

  protected readonly mensajes = MENSAJES_PERSONAS_ADMIN;
  protected readonly tonoRol = TONO_ROL;
  protected readonly persona = signal<PersonaDetalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly cabecera = computed(() => {
    const persona = this.persona();
    if (!persona) return null;
    return {
      denominacion: denominacionDe(persona),
      iniciales: inicialesDe(persona),
      documento: `${ETIQUETAS_TIPO_DOCUMENTO[persona.tipoDocumento]} ${persona.numeroDocumento}`,
      tipoPersona: ETIQUETAS_TIPO_PERSONA[persona.tipoPersona],
      roles: persona.roles.filter((rol) => rol.hasta === null).map((rol) => `${rol.productoCodigo} · ${ETIQUETAS_ROL[rol.rol]}`),
    };
  });

  constructor() {
    void this.cargar();
  }

  protected async alCambiar(cambio: CambioFicha): Promise<void> {
    if (cambio.tipo === 'actualizada') {
      this.persona.set(cambio.persona);
      return;
    }
    await this.cargar();
    if (cambio.aviso) this.avisos.toast('info', cambio.aviso);
  }

  private async cargar(): Promise<void> {
    this.error.set(null);
    try {
      this.persona.set(await this.personas.obtener(this.personaId));
    } catch (error) {
      const errorPersonas = error instanceof ErrorPersonas ? error : null;
      if (errorPersonas?.codigo === CODIGO_NO_ENCONTRADA) this.noExiste.set(true);
      else this.error.set(errorPersonas ? mensajeDeError(errorPersonas) : MENSAJES_PERSONAS_ADMIN.errorCarga);
    } finally {
      this.cargando.set(false);
    }
  }
}
