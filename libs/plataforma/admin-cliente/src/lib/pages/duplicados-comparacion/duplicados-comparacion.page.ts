import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  conservadaSugerida,
  denominacionDe,
  DuplicadosCliente,
  eleccionInicial,
  ErrorPersonas,
  formatoRol,
  MENSAJES_BLOQUEO,
  MENSAJES_DUPLICADOS,
  motivosDe,
  PERMISOS_PERSONAS,
  solicitudDe,
  TONO_DESCARTADO,
  TONO_ROL,
  TONOS_PUNTAJE,
  type CampoDatoBasico,
  type ClavePrincipal,
  type ComparacionPar,
  type EleccionFusion,
  type PersonaDetalle,
} from '@vitrina/plataforma/personas-ui';
import { SesionService } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, type TonoEstado } from '@vitrina/shared/ui';
import { OpcionFusionComponent } from '../../components/opcion-fusion/opcion-fusion.component';
import { confirmacionDeDescarte, descarteHecho, ESTADO_DESCARTE } from '../../models/descarte-hecho';
import { MENSAJES_COMPARACION } from '../../models/mensajes-comparacion';
import { mensajeDeFalloDuplicados } from '../../utils/error-duplicados';
import {
  conservadaYAbsorbida,
  denominacionResultante,
  documentoDe,
  fichaDe,
  fichasVista,
  filasDatosBasicos,
  gruposPrincipales,
  origenDe,
  otraFicha,
  type OpcionFusion,
} from '../../utils/vista-comparacion';

const MENSAJES = MENSAJES_COMPARACION;
const PARAMETRO_A = 'a';
const PARAMETRO_B = 'b';
const MOTIVO_MINIMO = 5;
const MOTIVO_MAXIMO = 300;
const TONO_POR_DEFECTO: TonoEstado = 'info';
const CODIGO_NO_ENCONTRADA = 'NO_ENCONTRADA';
/** Con estos errores la comparación ya no vale: se relee y se vuelve a la elección inicial. */
const CODIGOS_QUE_RECARGAN = new Set<string>(['VERSION_OBSOLETA', 'CAMPO_ELEGIDO_INVALIDO', CODIGO_NO_ENCONTRADA, ...Object.keys(MENSAJES_BLOQUEO)]);

/**
 * Comparación de dos fichas y fusión (spec 40, TR-RF-042 pasos 2 y 3): la ficha que queda, cada dato básico y cada
 * principal. Fusionar y descartar piden `plat.persona.fusionar` y aal2; sin MFA vigente la elección queda deshabilitada.
 */
@Component({
  selector: 'vit-duplicados-comparacion',
  imports: [MatButtonModule, MatIconModule, MatRadioModule, RouterLink, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, OpcionFusionComponent],
  templateUrl: './duplicados-comparacion.page.html',
})
export class DuplicadosComparacionPage {
  private readonly duplicados = inject(DuplicadosCliente);
  private readonly sesion = inject(SesionService);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly personaAId = this.ruta.snapshot.paramMap.get(PARAMETRO_A) ?? '';
  private readonly personaBId = this.ruta.snapshot.paramMap.get(PARAMETRO_B) ?? '';

  protected readonly mensajes = MENSAJES;
  protected readonly tonoRol = TONO_ROL;
  protected readonly tonoDescartado = TONO_DESCARTADO;

  protected readonly comparacion = signal<ComparacionPar | null>(null);
  protected readonly eleccion = signal<EleccionFusion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly enCurso = signal(false);

  protected readonly puedeFusionar = computed(() => this.sesion.tiene(PERMISOS_PERSONAS.fusionar));
  protected readonly sinMfa = computed(() => this.puedeFusionar() && !this.sesion.contexto()?.mfaVigente);
  protected readonly bloqueo = computed(() => {
    const codigo = this.comparacion()?.bloqueo;
    return codigo ? MENSAJES_BLOQUEO[codigo] : null;
  });
  /** Con permiso y sin bloqueo se elige; sin MFA, los radios se ven pero deshabilitados. */
  protected readonly editable = computed(() => this.puedeFusionar() && this.bloqueo() === null);
  protected readonly deshabilitada = computed(() => this.sinMfa() || this.enCurso());
  protected readonly puntaje = computed(() => {
    const comparacion = this.comparacion();
    if (!comparacion) return null;
    return {
      texto: MENSAJES.puntaje(comparacion.puntaje),
      tono: TONOS_PUNTAJE[comparacion.puntaje] ?? TONO_POR_DEFECTO,
      motivos: motivosDe(comparacion.motivos),
    };
  });
  protected readonly vista = computed(() => {
    const comparacion = this.comparacion();
    const eleccion = this.eleccion();
    if (!comparacion || !eleccion) return null;
    return {
      fichas: fichasVista(comparacion, eleccion, rolesDe),
      filas: filasDatosBasicos(comparacion, eleccion),
      grupos: gruposPrincipales(comparacion, eleccion),
      resultado: denominacionResultante(comparacion, eleccion),
      documentoQueda: documentoDe(fichaDe(comparacion, eleccion.conservadaId)),
      roles: [...rolesDe(comparacion.personaA), ...rolesDe(comparacion.personaB)],
    };
  });

  constructor() {
    void this.cargar();
  }

  protected elegirConservada(personaId: string): void {
    const comparacion = this.comparacion();
    if (!comparacion) return;
    this.eleccion.set(eleccionInicial(fichaDe(comparacion, personaId), otraFicha(comparacion, personaId)));
  }

  protected elegirDato(campo: CampoDatoBasico, opcion: OpcionFusion): void {
    const eleccion = this.eleccion();
    if (!eleccion) return;
    this.eleccion.set({ ...eleccion, datosBasicos: { ...eleccion.datosBasicos, [campo]: origenDe(eleccion, opcion.personaId) } });
  }

  protected elegirPrincipal(clave: ClavePrincipal, id: string): void {
    const eleccion = this.eleccion();
    if (!eleccion) return;
    this.eleccion.set({ ...eleccion, principales: { ...eleccion.principales, [clave]: id } });
  }

  protected async verificar(): Promise<void> {
    await this.accionSensible.exigirMfa();
  }

  protected async descartar(): Promise<void> {
    const comparacion = this.comparacion();
    if (!comparacion || !(await this.accionSensible.exigirMfa())) return;
    const { personaA, personaB } = comparacion;
    const [denominacionA, denominacionB] = [denominacionDe(personaA), denominacionDe(personaB)];
    if (!(await this.avisos.confirmar(confirmacionDeDescarte(denominacionA, denominacionB)))) return;
    if (!(await this.intentar(() => this.duplicados.descartar(personaA.id, personaB.id)))) return;
    const descarte = descarteHecho(personaA.id, personaB.id, denominacionA, denominacionB);
    await this.router.navigate(['../..'], { relativeTo: this.ruta, state: { [ESTADO_DESCARTE]: descarte } });
  }

  protected async volverAProponer(): Promise<void> {
    const comparacion = this.comparacion();
    if (!comparacion || !(await this.accionSensible.exigirMfa())) return;
    if (await this.intentar(() => this.duplicados.quitarDescarte(comparacion.personaA.id, comparacion.personaB.id))) await this.cargar();
  }

  protected async fusionar(): Promise<void> {
    const comparacion = this.comparacion();
    const eleccion = this.eleccion();
    if (!comparacion || !eleccion || !(await this.accionSensible.exigirMfa())) return;
    const [conservada, absorbida] = conservadaYAbsorbida(comparacion, eleccion);
    const respuesta = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES.tituloFusionar,
      texto: MENSAJES.textoFusionar(conDocumento(conservada), conDocumento(absorbida)),
      textoConfirmar: MENSAJES.fusionar,
      pedirMotivo: true,
      longitudMinimaMotivo: MOTIVO_MINIMO,
      longitudMaximaMotivo: MOTIVO_MAXIMO,
    });
    if (!respuesta.confirmado || respuesta.motivo === null) return;

    this.enCurso.set(true);
    try {
      const fusionada = await this.duplicados.fusionar(solicitudDe(eleccion, comparacion, respuesta.motivo));
      this.avisos.toast('exito', MENSAJES_DUPLICADOS.fusionada);
      await this.router.navigate(['../../..', fusionada.id], { relativeTo: this.ruta });
    } catch (error) {
      await this.tratarErrorDeFusion(error);
    } finally {
      this.enCurso.set(false);
    }
  }

  private async tratarErrorDeFusion(error: unknown): Promise<void> {
    await this.avisos.error(MENSAJES.tituloError, mensajeDeFalloDuplicados(error));
    if (error instanceof ErrorPersonas && CODIGOS_QUE_RECARGAN.has(error.codigo)) await this.cargar();
  }

  private async intentar(accion: () => Promise<void>): Promise<boolean> {
    try {
      await accion();
      return true;
    } catch (error) {
      await this.avisos.error(MENSAJES.tituloError, mensajeDeFalloDuplicados(error));
      return false;
    }
  }

  /** Lee el par y vuelve a la elección inicial con la conservada sugerida. */
  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const comparacion = await this.duplicados.comparar(this.personaAId, this.personaBId);
      const conservada = conservadaSugerida(comparacion.personaA, comparacion.personaB);
      this.comparacion.set(comparacion);
      this.eleccion.set(eleccionInicial(conservada, otraFicha(comparacion, conservada.id)));
      this.noExiste.set(false);
    } catch (error) {
      if (error instanceof ErrorPersonas && error.codigo === CODIGO_NO_ENCONTRADA) {
        this.noExiste.set(true);
        this.comparacion.set(null);
      } else {
        this.error.set(mensajeDeFalloDuplicados(error));
      }
    } finally {
      this.cargando.set(false);
    }
  }
}

function rolesDe(persona: PersonaDetalle): string[] {
  return persona.roles.filter((rol) => rol.hasta === null).map((rol) => formatoRol(rol.productoCodigo, rol.rol));
}

function conDocumento(persona: PersonaDetalle): string {
  return MENSAJES.conDocumento(denominacionDe(persona), documentoDe(persona));
}
