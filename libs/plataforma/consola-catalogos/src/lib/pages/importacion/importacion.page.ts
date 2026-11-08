import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatearFechaCalendario } from '@vitrina/plataforma/catalogos-ui';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { ErroresImportacionComponent } from '../../components/errores-importacion/errores-importacion.component';
import { ResumenPrevisualizacionComponent } from '../../components/resumen-previsualizacion/resumen-previsualizacion.component';
import type { Catalogo } from '../../models/catalogo';
import { aErrorCatalogos, ErrorFilasInvalidas, type ErrorCatalogos } from '../../models/error-catalogos';
import type { FilasInvalidas, Previsualizacion } from '../../models/importacion';
import {
  mensajeAplicarConBajas,
  mensajeCierreVigencias,
  MENSAJES_DETALLE_CATALOGO,
  MENSAJES_IMPORTACION,
  mensajeResumenAplicar,
  mensajeTituloImportar,
  mensajeVenceEn,
} from '../../models/mensajes-catalogos';
import { AdaptadorFechaPeru } from '../../services/adaptador-fecha-peru.service';
import { CalendarioEnEspanol } from '../../services/calendario-en-espanol.service';
import { CatalogosCliente } from '../../services/catalogos.cliente';
import { ImportacionesCliente } from '../../services/importaciones.cliente';
import { SeguimientoImportacionesService } from '../../services/seguimiento-importaciones.service';
import { PARAMETRO_URL_DETALLE, type PestanaDetalle } from '../../utils/filtro-url';
import { formatearFechaHora } from '../../utils/formato';
import {
  aArchivoAPrevisualizar,
  crearGrupoImportacion,
  EXTENSIONES_ACEPTADAS,
  mensajeDeErrorArchivo,
  mensajeDeErrorImportacion,
  tamanoLegible,
} from '../../utils/formulario-importacion';

const PARAMETRO_CODIGO = 'codigo';
const LOCALE_PERU = 'es-PE';
const PASO_ARCHIVO = 0;
const PASO_PREVISUALIZACION = 1;
const CODIGO_NO_APLICABLE = 'IMPORTACION_NO_APLICABLE';
const CODIGO_COLA_NO_DISPONIBLE = 'COLA_NO_DISPONIBLE';
const PESTANA_IMPORTACIONES: PestanaDetalle = 'importaciones';

/**
 * Importación por pasos de una tabla oficial (TR-RF-028, TR-CA-072 y 073). El estado vive solo en la página:
 * al recargar vuelve al paso 1. Al encolar, el seguimiento global toma el relevo y el usuario sigue navegando.
 */
@Component({
  selector: 'vit-importacion',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatStepperModule,
    RouterLink,
    CargandoComponent,
    EstadoVacioComponent,
    ErroresImportacionComponent,
    ResumenPrevisualizacionComponent,
  ],
  providers: [
    provideNativeDateAdapter(),
    { provide: DateAdapter, useClass: AdaptadorFechaPeru },
    { provide: MAT_DATE_LOCALE, useValue: LOCALE_PERU },
    { provide: MatDatepickerIntl, useClass: CalendarioEnEspanol },
  ],
  templateUrl: './importacion.page.html',
})
export class ImportacionPage {
  private readonly catalogos = inject(CatalogosCliente);
  private readonly importaciones = inject(ImportacionesCliente);
  private readonly seguimiento = inject(SeguimientoImportacionesService);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_IMPORTACION;
  protected readonly migaCatalogos = MENSAJES_DETALLE_CATALOGO.migaCatalogos;
  protected readonly migas = MENSAJES_DETALLE_CATALOGO.migas;
  protected readonly noExisteCatalogo = MENSAJES_DETALLE_CATALOGO.noExiste;
  protected readonly aceptados = EXTENSIONES_ACEPTADAS.join(',');
  protected readonly mensajeDeError = mensajeDeErrorImportacion;
  protected readonly mensajeDeErrorArchivo = mensajeDeErrorArchivo;
  /** La ruta que monta la lib (`consola/catalogos`): el detalle cuelga de ella. */
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly codigo = this.ruta.snapshot.paramMap.get(PARAMETRO_CODIGO) ?? '';
  protected readonly titulo = mensajeTituloImportar(this.codigo);
  protected readonly grupo = crearGrupoImportacion();

  protected readonly catalogo = signal<Catalogo | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly paso = signal(PASO_ARCHIVO);
  protected readonly archivo = signal<File | null>(null);
  protected readonly previsualizando = signal(false);
  protected readonly aplicando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filasInvalidas = signal<FilasInvalidas | null>(null);
  protected readonly previsualizacion = signal<Previsualizacion | null>(null);

  protected readonly tamanoArchivo = computed(() => {
    const archivo = this.archivo();
    return archivo ? tamanoLegible(archivo.size) : null;
  });
  protected readonly vencimiento = computed(() => {
    const previa = this.previsualizacion();
    return previa ? mensajeVenceEn(formatearFechaHora(previa.venceEn)) : null;
  });
  protected readonly vigenciaPrevia = computed(() => {
    const previa = this.previsualizacion();
    return previa ? formatearFechaCalendario(previa.fechaVigencia) : null;
  });

  constructor() {
    void this.iniciar();
  }

  protected elegirArchivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.item(0) ?? null;
    this.archivo.set(archivo);
    this.grupo.controls.archivo.setValue(archivo);
    this.grupo.controls.archivo.markAsTouched();
    entrada.value = '';
  }

  protected async previsualizar(): Promise<void> {
    if (this.previsualizando()) return;
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.previsualizando.set(true);
    this.error.set(null);
    this.filasInvalidas.set(null);
    try {
      this.previsualizacion.set(await this.importaciones.previsualizar(this.codigo, aArchivoAPrevisualizar(this.grupo)));
      this.paso.set(PASO_PREVISUALIZACION);
    } catch (error) {
      this.mostrarErrorDeArchivo(aErrorCatalogos(error));
    } finally {
      this.previsualizando.set(false);
    }
  }

  protected cambiarArchivo(): void {
    this.error.set(null);
    this.previsualizacion.set(null);
    this.paso.set(PASO_ARCHIVO);
  }

  protected async aplicar(): Promise<void> {
    const previa = this.previsualizacion();
    if (!previa || this.aplicando()) return;

    this.aplicando.set(true);
    this.error.set(null);
    try {
      if (!(await this.accionSensible.exigirMfa())) return;
      if (!(await this.confirmarAplicacion(previa))) return;
      const encolada = await this.importaciones.aplicar(previa.id, previa.version);
      this.seguimiento.seguir(encolada.id, this.codigo);
      this.avisos.toast('info', MENSAJES_IMPORTACION.enCola);
      await this.irAlDetalle(PESTANA_IMPORTACIONES);
    } catch (error) {
      this.mostrarErrorAlAplicar(aErrorCatalogos(error));
    } finally {
      this.aplicando.set(false);
    }
  }

  protected cancelar(): void {
    void this.irAlDetalle();
  }

  private irAlDetalle(pestana?: PestanaDetalle): Promise<boolean> {
    const queryParams = pestana ? { [PARAMETRO_URL_DETALLE.pestana]: pestana } : {};
    return this.router.navigate([this.codigo], { relativeTo: this.rutaMontaje, queryParams });
  }

  /** TR-RNF-021: con bajas, la confirmación es destructiva, porque cierra vigencias. */
  private async confirmarAplicacion(previa: Previsualizacion): Promise<boolean> {
    const { altas, cambios, bajas } = previa.resumen;
    if (bajas > 0) {
      const resultado = await this.avisos.confirmarDestructiva({
        titulo: MENSAJES_IMPORTACION.tituloAplicar,
        texto: mensajeCierreVigencias(bajas),
        textoConfirmar: mensajeAplicarConBajas(bajas),
      });
      return resultado.confirmado;
    }
    return this.avisos.confirmar({ titulo: MENSAJES_IMPORTACION.tituloAplicar, texto: mensajeResumenAplicar(altas, cambios), textoConfirmar: MENSAJES_IMPORTACION.aplicar });
  }

  private mostrarErrorDeArchivo(error: ErrorCatalogos): void {
    if (error instanceof ErrorFilasInvalidas) {
      this.filasInvalidas.set(error.filas);
      return;
    }
    this.error.set(error.message);
  }

  private mostrarErrorAlAplicar(error: ErrorCatalogos): void {
    if (error.codigo === CODIGO_NO_APLICABLE) {
      this.cambiarArchivo();
      this.error.set(MENSAJES_IMPORTACION.vencida);
      return;
    }
    this.error.set(error.codigo === CODIGO_COLA_NO_DISPONIBLE ? MENSAJES_IMPORTACION.colaNoDisponible : error.message);
  }

  private async iniciar(): Promise<void> {
    if (!(await this.accionSensible.exigirMfa())) return;
    try {
      const catalogo = (await this.catalogos.listar()).find((candidato) => candidato.codigo === this.codigo);
      if (catalogo) this.catalogo.set(catalogo);
      else this.noExiste.set(true);
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
