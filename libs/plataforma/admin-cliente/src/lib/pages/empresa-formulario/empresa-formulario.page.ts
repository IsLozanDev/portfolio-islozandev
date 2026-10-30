import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import type { Empresa } from '../../models/empresa';
import { aErrorAdmin, CODIGO_NO_ENCONTRADO, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import { MENSAJES_EMPRESAS, MENSAJES_ORGANIZACION } from '../../models/mensajes-organizacion';
import { EmpresasCliente } from '../../services/empresas.cliente';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { PARAMETRO_URL_ORGANIZACION } from '../../utils/filtro-url-organizacion';
import { aDatosEmpresa, cargarEmpresa, crearGrupoEmpresa, rucDe } from '../../utils/formulario-empresa';
import { mensajeDeErrorOrganizacion } from '../../utils/validadores-organizacion';

const PARAMETRO_EMPRESA_ID = 'empresaId';
/** Rutas hermanas, relativas a la ruta que monta la lib (`/admin` en plataforma-admin, TR-RNF-122). */
const RUTA_EMPRESAS = 'empresas';
const RUTA_SUCURSALES = 'sucursales';

/** Alta (`/empresas/nueva`) y edición (`/empresas/:empresaId/editar`) de una empresa (U-05, TR-RF-002). */
@Component({
  selector: 'vit-empresa-formulario',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink, AccionesFormularioComponent, CargandoComponent, EstadoVacioComponent],
  templateUrl: './empresa-formulario.page.html',
})
export class EmpresaFormularioPage {
  private readonly empresas = inject(EmpresasCliente);
  private readonly recargaContexto = inject(RecargaContextoService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_EMPRESAS;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly rutaEmpresas = RUTA_EMPRESAS;
  protected readonly rutaMontaje = this.ruta.parent;
  protected readonly mensajeDeError = mensajeDeErrorOrganizacion;
  protected readonly grupo = crearGrupoEmpresa();
  /** null en el alta. */
  protected readonly empresaId = this.ruta.snapshot.paramMap.get(PARAMETRO_EMPRESA_ID);
  protected readonly empresa = signal<Empresa | null>(null);
  protected readonly cargando = signal(this.empresaId !== null);
  protected readonly noExiste = signal(false);
  protected readonly versionObsoleta = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    if (this.empresaId) void this.cargar(this.empresaId);
  }

  /** TR-RNF-008: trae lo que guardó el otro usuario y descarta lo editado aquí. */
  protected recargar(): void {
    if (this.empresaId) void this.cargar(this.empresaId);
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
    void this.router.navigate([RUTA_EMPRESAS], { relativeTo: this.rutaMontaje });
  }

  private async enviar(): Promise<void> {
    const empresa = this.empresa();
    if (empresa) {
      await this.empresas.editar(empresa.id, empresa.version, aDatosEmpresa(this.grupo));
      this.avisos.toast('exito', MENSAJES_EMPRESAS.actualizada);
      await this.router.navigate([RUTA_EMPRESAS], { relativeTo: this.rutaMontaje });
      return;
    }

    const { empresaId } = await this.empresas.registrar(rucDe(this.grupo), aDatosEmpresa(this.grupo));
    this.avisos.toast('exito', MENSAJES_EMPRESAS.registrada);
    // La principal nueva entra al selector de sucursales del shell.
    await this.recargaContexto.recargar();
    await this.router.navigate([RUTA_SUCURSALES], { relativeTo: this.rutaMontaje, queryParams: { [PARAMETRO_URL_ORGANIZACION.empresa]: empresaId } });
  }

  private mostrarError(error: unknown): void {
    const errorAdmin = aErrorAdmin(error);
    if (errorAdmin.codigo === CODIGO_VERSION_OBSOLETA) this.versionObsoleta.set(true);
    else this.error.set(errorAdmin.message);
  }

  private async cargar(empresaId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      const empresa = await this.empresas.consultar(empresaId);
      cargarEmpresa(this.grupo, empresa);
      this.empresa.set(empresa);
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_NO_ENCONTRADO) this.noExiste.set(true);
      else this.error.set(errorAdmin.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
