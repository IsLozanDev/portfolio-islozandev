import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { ALCANCES_CATALOGO, type Catalogo } from '../../models/catalogo';
import { aErrorCatalogos, type ErrorCatalogos } from '../../models/error-catalogos';
import { ETIQUETAS_ALCANCE, MENSAJES_FORMULARIO_CATALOGO } from '../../models/mensajes-catalogos';
import { CatalogosCliente } from '../../services/catalogos.cliente';
import {
  aCambiosCatalogo,
  aSolicitudCatalogo,
  cargarCatalogo,
  crearGrupoCatalogo,
  ERROR_API,
  mantenerCoherenciaEditable,
  mensajeDeErrorCatalogo,
} from '../../utils/formulario-catalogo';

const PARAMETRO_CODIGO = 'codigo';
const CODIGO_VERSION_OBSOLETA = 'VERSION_OBSOLETA';

/** Alta (`nuevo`) y edición (`:codigo/editar`) de un catálogo (TR-RF-022, TR-CA-058 y 059). */
@Component({
  selector: 'vit-catalogo-formulario',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    RouterLink,
    AccionesFormularioComponent,
    CargandoComponent,
    EstadoVacioComponent,
  ],
  templateUrl: './catalogo-formulario.page.html',
})
export class CatalogoFormularioPage {
  private readonly catalogos = inject(CatalogosCliente);
  private readonly accionSensible = inject(AccionSensibleService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_FORMULARIO_CATALOGO;
  protected readonly alcances = ALCANCES_CATALOGO;
  protected readonly etiquetasAlcance = ETIQUETAS_ALCANCE;
  /** La ruta que monta la lib (`consola/catalogos`): la lista y los detalles cuelgan de ella. */
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly mensajeDeError = mensajeDeErrorCatalogo;
  protected readonly grupo = crearGrupoCatalogo();
  /** null en el alta. */
  protected readonly codigo = this.ruta.snapshot.paramMap.get(PARAMETRO_CODIGO);
  protected readonly catalogo = signal<Catalogo | null>(null);
  protected readonly cargando = signal(this.codigo !== null);
  protected readonly noExiste = signal(false);
  protected readonly versionObsoleta = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    mantenerCoherenciaEditable(this.grupo, inject(DestroyRef));
    if (this.codigo) void this.cargar(this.codigo);
  }

  /** TR-RNF-008: trae lo que guardó el otro usuario y descarta lo editado aquí. */
  protected recargar(): void {
    if (this.codigo) void this.cargar(this.codigo);
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      if (!(await this.accionSensible.exigirMfa())) return;
      await this.enviar();
    } catch (error) {
      this.mostrarError(aErrorCatalogos(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.router.navigate(this.codigo ? [this.codigo] : [], { relativeTo: this.rutaMontaje });
  }

  private async enviar(): Promise<void> {
    const catalogo = this.catalogo();
    if (!catalogo) {
      const creado = await this.catalogos.crear(aSolicitudCatalogo(this.grupo));
      this.avisos.toast('exito', MENSAJES_FORMULARIO_CATALOGO.creado);
      await this.irAlDetalle(creado.codigo);
      return;
    }

    const actualizado = await this.catalogos.actualizar(catalogo.codigo, aCambiosCatalogo(this.grupo), catalogo.version);
    this.avisos.toast('exito', actualizado.cambiado ? MENSAJES_FORMULARIO_CATALOGO.actualizado : MENSAJES_FORMULARIO_CATALOGO.sinCambios);
    await this.irAlDetalle(catalogo.codigo);
  }

  private irAlDetalle(codigo: string): Promise<boolean> {
    return this.router.navigate([codigo], { relativeTo: this.rutaMontaje });
  }

  private mostrarError(error: ErrorCatalogos): void {
    if (error.codigo === CODIGO_VERSION_OBSOLETA) {
      this.versionObsoleta.set(true);
      return;
    }
    const campo = error.campo ? this.grupo.get(error.campo) : null;
    if (!campo) {
      this.error.set(error.message);
      return;
    }
    campo.setErrors({ [ERROR_API]: error.message });
    campo.markAsTouched();
  }

  private async cargar(codigo: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      const catalogo = (await this.catalogos.listar()).find((candidato) => candidato.codigo === codigo);
      if (!catalogo) {
        this.noExiste.set(true);
        return;
      }
      cargarCatalogo(this.grupo, catalogo);
      this.catalogo.set(catalogo);
    } catch (error) {
      this.error.set(aErrorCatalogos(error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
