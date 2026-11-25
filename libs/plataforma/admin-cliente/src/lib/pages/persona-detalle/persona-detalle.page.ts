import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  denominacionDe,
  DuplicadosCliente,
  ErrorPersonas,
  ETIQUETAS_TIPO_PERSONA,
  formatoDocumento,
  formatoRol,
  inicialesDe,
  mensajeDeError,
  MENSAJES_DUPLICADOS,
  motivosDe,
  PersonaConsentimientosComponent,
  PersonaContactosComponent,
  PersonaDatosBasicosComponent,
  PersonaDireccionesComponent,
  PersonaRolesComponent,
  PersonasCliente,
  TONO_ROL,
  TONOS_PUNTAJE,
  type CambioFicha,
  type PaginaDuplicados,
  type PersonaDetalle,
} from '@vitrina/plataforma/personas-ui';
import { AvisosService, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, type TonoEstado } from '@vitrina/shared/ui';
import { map } from 'rxjs';
import { MENSAJES_PERSONAS_ADMIN } from '../../models/mensajes-personas-admin';
import { MENSAJES_COMPARACION } from '../../models/mensajes-comparacion';

const PARAMETRO_PERSONA = 'personaId';
const CODIGO_NO_ENCONTRADA = 'NO_ENCONTRADA';
/** Para la sección de duplicados basta el total y un par de muestra. */
const MUESTRA_DUPLICADOS = { pagina: 1, tamano: 1 } as const;
const TONO_POR_DEFECTO: TonoEstado = 'info';

interface ResumenDuplicados {
  titulo: string;
  texto: string;
  otra: string;
  documento: string;
  puntaje: string;
  tonoPuntaje: TonoEstado;
  motivos: string;
}

/**
 * Ficha de una persona (spec 38): datos básicos, contactos, direcciones, roles y consentimientos. Cada sección
 * avisa su cambio: con la persona nueva se reemplaza sin releer; si pide recargar, se relee y se muestra el aviso.
 * Spec 40: la ficha de una absorbida se cambia por la conservada y muestra sus posibles duplicados.
 */
@Component({
  selector: 'vit-persona-detalle',
  imports: [
    MatButtonModule,
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
  private readonly duplicados = inject(DuplicadosCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_PERSONAS_ADMIN;
  protected readonly tonoRol = TONO_ROL;
  protected readonly personaId = signal('');
  protected readonly persona = signal<PersonaDetalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duplicadosDeLaPersona = signal<ResumenDuplicados | null>(null);

  protected readonly cabecera = computed(() => {
    const persona = this.persona();
    if (!persona) return null;
    return {
      denominacion: denominacionDe(persona),
      iniciales: inicialesDe(persona),
      documento: formatoDocumento(persona.tipoDocumento, persona.numeroDocumento),
      tipoPersona: ETIQUETAS_TIPO_PERSONA[persona.tipoPersona],
      roles: persona.roles.filter((rol) => rol.hasta === null).map((rol) => formatoRol(rol.productoCodigo, rol.rol)),
    };
  });

  constructor() {
    // El componente se reutiliza al pasar de la absorbida a la conservada: el id se lee del paramMap, no del snapshot.
    this.ruta.paramMap
      .pipe(
        map((parametros) => parametros.get(PARAMETRO_PERSONA) ?? ''),
        takeUntilDestroyed(),
      )
      .subscribe((personaId) => {
        this.personaId.set(personaId);
        if (this.persona()?.id !== personaId) void this.cargar();
      });
  }

  protected async alCambiar(cambio: CambioFicha): Promise<void> {
    if (cambio.tipo === 'actualizada') {
      this.persona.set(cambio.persona);
      return;
    }
    const aliasResuelto = await this.cargar();
    if (cambio.aviso && !aliasResuelto) this.avisos.toast('info', cambio.aviso);
  }

  /** Devuelve true si se pidió una absorbida y se pasó a la conservada. */
  private async cargar(): Promise<boolean> {
    this.error.set(null);
    try {
      const persona = await this.personas.obtener(this.personaId());
      this.persona.set(persona);
      this.noExiste.set(false);
      void this.cargarDuplicados(persona.id);
      if (persona.resueltaDesde === null) return false;
      await this.irALaConservada(persona);
      return true;
    } catch (error) {
      const errorPersonas = error instanceof ErrorPersonas ? error : null;
      if (errorPersonas?.codigo === CODIGO_NO_ENCONTRADA) this.noExiste.set(true);
      else this.error.set(errorPersonas ? mensajeDeError(errorPersonas) : MENSAJES_PERSONAS_ADMIN.errorCarga);
      return false;
    } finally {
      this.cargando.set(false);
    }
  }

  private async irALaConservada(conservada: PersonaDetalle): Promise<void> {
    this.avisos.toast('info', MENSAJES_DUPLICADOS.aliasResuelto(denominacionDe(conservada)));
    await this.router.navigate(['..', conservada.id], { relativeTo: this.ruta, replaceUrl: true });
  }

  /** La sección solo aparece con pares; si la consulta falla, no aparece y la ficha sigue. */
  private async cargarDuplicados(personaId: string): Promise<void> {
    this.duplicadosDeLaPersona.set(null);
    try {
      const pagina = await this.duplicados.listar({ ...MUESTRA_DUPLICADOS, personaId });
      if (this.persona()?.id === personaId) this.duplicadosDeLaPersona.set(resumenDe(pagina, personaId));
    } catch {
      this.duplicadosDeLaPersona.set(null);
    }
  }
}

function resumenDe(pagina: PaginaDuplicados, personaId: string): ResumenDuplicados | null {
  const [par] = pagina.items;
  if (!par || pagina.total === 0) return null;
  const otra = par.personaA.id === personaId ? par.personaB : par.personaA;
  return {
    titulo: MENSAJES_PERSONAS_ADMIN.posiblesDuplicados(pagina.total),
    texto: MENSAJES_PERSONAS_ADMIN.textoDuplicados(pagina.total),
    otra: otra.denominacion,
    documento: formatoDocumento(otra.tipoDocumento, otra.numeroDocumento),
    puntaje: MENSAJES_COMPARACION.puntaje(par.puntaje),
    tonoPuntaje: TONOS_PUNTAJE[par.puntaje] ?? TONO_POR_DEFECTO,
    motivos: motivosDe(par.motivos),
  };
}
