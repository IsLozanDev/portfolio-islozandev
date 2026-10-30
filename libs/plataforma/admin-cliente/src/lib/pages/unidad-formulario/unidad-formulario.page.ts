import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import { aErrorAdmin, CODIGO_NO_ENCONTRADO, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import { MENSAJES_ORGANIZACION, MENSAJES_UNIDADES } from '../../models/mensajes-organizacion';
import { ETIQUETAS_TIPO_UNIDAD, TIPOS_UNIDAD } from '../../models/tipos-unidad';
import type { Ubicacion } from '../../models/ubicacion';
import type { Unidad } from '../../models/unidad';
import { OrganizacionCliente } from '../../services/organizacion.cliente';
import { UnidadesCliente } from '../../services/unidades.cliente';
import { PARAMETRO_URL_ORGANIZACION, TAMANO_OPCIONES_ORGANIZACION } from '../../utils/filtro-url-organizacion';
import { aAltaUnidad, aDatosUnidad, cargarUnidad, crearGrupoUnidad } from '../../utils/formulario-unidad';
import { ERROR_SUCURSAL_REQUERIDA, mensajeDeErrorOrganizacion } from '../../utils/validadores-organizacion';

const PARAMETRO_UNIDAD_ID = 'unidadId';
/** Ruta hermana, relativa a la ruta que monta la lib (`/admin` en plataforma-admin, TR-RNF-122). */
const RUTA_UNIDADES = 'unidades';

/** Alta (`/unidades/nueva?empresa=&sucursal=`) y edición (`/unidades/:unidadId/editar`) de una unidad (U-05, TR-RF-004). */
@Component({
  selector: 'vit-unidad-formulario',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, RouterLink, AccionesFormularioComponent, CargandoComponent, EstadoVacioComponent],
  templateUrl: './unidad-formulario.page.html',
})
export class UnidadFormularioPage {
  private readonly unidades = inject(UnidadesCliente);
  private readonly organizacion = inject(OrganizacionCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_UNIDADES;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly tipos = TIPOS_UNIDAD;
  protected readonly etiquetasTipo = ETIQUETAS_TIPO_UNIDAD;
  protected readonly rutaUnidades = RUTA_UNIDADES;
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly errorSucursalRequerida = ERROR_SUCURSAL_REQUERIDA;
  protected readonly mensajeDeError = mensajeDeErrorOrganizacion;
  protected readonly grupo = crearGrupoUnidad();
  /** null en el alta. */
  protected readonly unidadId = this.ruta.snapshot.paramMap.get(PARAMETRO_UNIDAD_ID);
  /** En el alta llega por la URL; en la edición, de la unidad cargada. */
  private readonly empresaIdDelAlta = this.ruta.snapshot.queryParamMap.get(PARAMETRO_URL_ORGANIZACION.empresa);
  protected readonly unidad = signal<Unidad | null>(null);
  protected readonly sucursales = signal<Ubicacion[]>([]);
  /** Unidades activas de la misma empresa y sucursal (o de nivel empresa), sin la editada. */
  protected readonly padres = signal<Unidad[]>([]);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly versionObsoleta = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  private consultaPadres = 0;

  constructor() {
    // Solo en el alta cambia la sucursal; en la edición el `reset` de `cargarUnidad` no debe borrar el padre.
    if (!this.unidadId) {
      this.grupo.controls.sucursalId.valueChanges.pipe(takeUntilDestroyed()).subscribe((sucursalId) => {
        this.grupo.controls.padreId.setValue(null);
        void this.cargarPadres(this.empresaIdDelAlta, sucursalId);
      });
    }
    void this.iniciar();
  }

  /** TR-RNF-008: trae lo que guardó el otro usuario y descarta lo editado aquí. */
  protected recargar(): void {
    if (this.unidadId) void this.cargarEdicion(this.unidadId);
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
      await this.enviar();
    } catch (error) {
      this.mostrarError(error);
    } finally {
      this.guardando.set(false);
    }
  }

  protected cancelar(): void {
    void this.volverALista();
  }

  private empresaId(): string | null {
    return this.unidad()?.empresaId ?? this.empresaIdDelAlta;
  }

  private async iniciar(): Promise<void> {
    if (this.unidadId) {
      await this.cargarEdicion(this.unidadId);
      return;
    }
    // El alta necesita la empresa: sin ella, a la lista, que elige una.
    if (!this.empresaIdDelAlta) {
      await this.volverALista();
      return;
    }
    await this.cargarSucursales(this.empresaIdDelAlta);
    // Pone la sucursal de la URL; el cambio carga sus padres.
    this.grupo.controls.sucursalId.setValue(this.ruta.snapshot.queryParamMap.get(PARAMETRO_URL_ORGANIZACION.sucursal));
    this.cargando.set(false);
  }

  private async enviar(): Promise<void> {
    const unidad = this.unidad();
    const empresaId = this.empresaId();
    if (!empresaId) return;
    if (unidad) await this.unidades.editar(unidad.id, unidad.version, aDatosUnidad(this.grupo, unidad.atributos));
    else await this.unidades.registrar(aAltaUnidad(this.grupo, empresaId));

    this.avisos.toast('exito', unidad ? MENSAJES_UNIDADES.actualizada : MENSAJES_UNIDADES.registrada);
    await this.volverALista();
  }

  private mostrarError(error: unknown): void {
    const errorAdmin = aErrorAdmin(error);
    if (errorAdmin.codigo === CODIGO_VERSION_OBSOLETA) this.versionObsoleta.set(true);
    else this.error.set(errorAdmin.message);
  }

  /** A la lista de la empresa, con la sucursal elegida como filtro. */
  private async volverALista(): Promise<void> {
    const queryParams = {
      [PARAMETRO_URL_ORGANIZACION.empresa]: this.empresaId(),
      [PARAMETRO_URL_ORGANIZACION.sucursal]: this.grupo.controls.sucursalId.value,
    };
    await this.router.navigate([RUTA_UNIDADES], { relativeTo: this.rutaMontaje, queryParams });
  }

  private async cargarEdicion(unidadId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      const unidad = await this.unidades.consultar(unidadId);
      await this.cargarSucursales(unidad.empresaId);
      this.unidad.set(unidad);
      cargarUnidad(this.grupo, unidad);
      await this.cargarPadres(unidad.empresaId, unidad.sucursalId);
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_NO_ENCONTRADO) this.noExiste.set(true);
      else this.error.set(errorAdmin.message);
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarSucursales(empresaId: string): Promise<void> {
    this.sucursales.set(await this.organizacion.sucursales(empresaId));
  }

  /** La API no filtra «sin sucursal»: para el nivel empresa se piden las de la empresa y se quedan las sin sucursal. */
  private async cargarPadres(empresaId: string | null, sucursalId: string | null): Promise<void> {
    if (!empresaId) return;
    const consulta = ++this.consultaPadres;
    try {
      const filtro = { empresaId, sucursalId: sucursalId ?? undefined, activo: true, pagina: 1, tamano: TAMANO_OPCIONES_ORGANIZACION };
      const { items } = await this.unidades.listar(filtro);
      if (consulta !== this.consultaPadres) return;
      this.padres.set(items.filter((candidata) => candidata.sucursalId === sucursalId && candidata.id !== this.unidadId));
    } catch (error) {
      if (consulta === this.consultaPadres) this.error.set(aErrorAdmin(error).message);
    }
  }
}
