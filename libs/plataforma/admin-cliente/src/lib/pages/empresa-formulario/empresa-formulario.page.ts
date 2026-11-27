import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArchivoCargaComponent, PERMISOS_ARCHIVOS, type ArchivoDisponible } from '@vitrina/plataforma/archivos-ui';
import { UbigeoAutocompletarComponent } from '@vitrina/plataforma/personas-ui';
import { SesionService } from '@vitrina/shared/auth';
import { AccionesFormularioComponent, AvisosService, CargandoComponent, ChipEstadoComponent, EstadoVacioComponent, TelefonoDirective } from '@vitrina/shared/ui';
import { LogoEmpresaComponent } from '../../components/logo-empresa/logo-empresa.component';
import { motivoDeLogoInvalido, type Empresa } from '../../models/empresa';
import { aErrorAdmin, CODIGO_NO_ENCONTRADO, CODIGO_VERSION_OBSOLETA } from '../../models/error-admin';
import { MENSAJES_EMPRESAS, MENSAJES_LOGO_INVALIDO, MENSAJES_ORGANIZACION, TEXTOS_UBIGEO_ORGANIZACION } from '../../models/mensajes-organizacion';
import { PERMISO_CONSULTAR_IDENTIDAD, type DatosPadronRuc } from '../../models/padron';
import { EmpresasCliente } from '../../services/empresas.cliente';
import { LogosEmpresaService } from '../../services/logos-empresa.service';
import { PadronCliente } from '../../services/padron.cliente';
import { RecargaContextoService } from '../../services/recarga-contexto.service';
import { UbigeosOrganizacionService } from '../../services/ubigeos-organizacion.service';
import { aDatosEdicionEmpresa, aDatosEmpresa, cargarEmpresa, crearGrupoEmpresa, rucDe } from '../../utils/formulario-empresa';
import { validarRuc } from '../../utils/ruc';
import { completarEsquemaWeb, mensajeDeErrorOrganizacion } from '../../utils/validadores-organizacion';

const PARAMETRO_EMPRESA_ID = 'empresaId';
/** Rutas hermanas, relativas a la ruta que monta la lib (`/admin` en plataforma-admin, TR-RNF-122). */
const RUTA_EMPRESAS = 'empresas';
const RUTA_EDITAR = 'editar';
/** Clave del `history.state` con que el alta pasa a la edición (spec 17d). */
export const ESTADO_RECIEN_REGISTRADA = 'recienRegistrada';
const CATEGORIA_LOGO = 'LOGO';
const ENTIDAD_ARCHIVO_EMPRESA = 'EMPRESA';

/** Alta (`/empresas/nueva`) y edición (`/empresas/:empresaId/editar`) de una empresa (U-05, TR-RF-002, spec 17d). */
@Component({
  selector: 'vit-empresa-formulario',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
    AccionesFormularioComponent,
    ArchivoCargaComponent,
    CargandoComponent,
    ChipEstadoComponent,
    EstadoVacioComponent,
    LogoEmpresaComponent,
    TelefonoDirective,
    UbigeoAutocompletarComponent,
  ],
  templateUrl: './empresa-formulario.page.html',
})
export class EmpresaFormularioPage {
  private readonly empresas = inject(EmpresasCliente);
  private readonly padron = inject(PadronCliente);
  private readonly ubigeos = inject(UbigeosOrganizacionService);
  private readonly logos = inject(LogosEmpresaService);
  private readonly sesion = inject(SesionService);
  private readonly recargaContexto = inject(RecargaContextoService);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly mensajes = MENSAJES_EMPRESAS;
  protected readonly comunes = MENSAJES_ORGANIZACION;
  protected readonly textosUbigeo = TEXTOS_UBIGEO_ORGANIZACION;
  protected readonly categoriaLogo = CATEGORIA_LOGO;
  protected readonly entidadArchivo = ENTIDAD_ARCHIVO_EMPRESA;
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
  protected readonly consultandoPadron = signal(false);
  protected readonly noEstaEnPadron = signal(false);
  /** TR-RN-019: se avisa antes de registrar; no bloquea. */
  protected readonly motivoNoApto = signal<string | null>(null);
  protected readonly recienRegistrada = this.router.currentNavigation()?.extras.state?.[ESTADO_RECIEN_REGISTRADA] === true;

  protected readonly puedeSubirLogo = this.sesion.tiene(PERMISOS_ARCHIVOS.subir);
  protected readonly sinPermisoCatalogo = this.ubigeos.sinPermiso();
  protected readonly urlLogo = signal<string | null>(null);
  protected readonly errorLogo = signal<string | null>(null);
  /** Cambia para volver a crear la zona de carga: así queda vacía después de quitar el logo. */
  protected readonly reinicioZona = signal(0);
  private readonly logoElegido = toSignal(this.grupo.controls.logoArchivoId.valueChanges, { initialValue: null });
  protected readonly logoPendiente = computed(() => {
    const empresa = this.empresa();
    return empresa !== null && this.logoElegido() !== null && this.logoElegido() !== empresa.logoArchivoId;
  });
  protected readonly logoPorQuitar = computed(() => this.empresa()?.logoArchivoId != null && this.logoElegido() === null);
  protected readonly conLogo = computed(() => this.logoElegido() !== null);
  protected readonly nombreEmpresa = toSignal(this.grupo.controls.razonSocial.valueChanges, { initialValue: '' });

  /** Evita repetir la consulta al salir otra vez del campo con el mismo RUC. */
  private rucConsultado: string | null = null;

  constructor() {
    if (this.empresaId) void this.cargar(this.empresaId);
    else if (this.sinPermisoCatalogo) this.grupo.controls.ubigeo.disable();
    this.grupo.controls.ruc.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.olvidarPadron());
  }

  /** Spec 28b: solo en el alta, con RUC válido y permiso de consulta, prellena la razón social del padrón. */
  protected async alSalirDelRuc(): Promise<void> {
    const ruc = rucDe(this.grupo);
    if (this.empresaId || ruc === this.rucConsultado || !validarRuc(ruc) || !this.sesion.tiene(PERMISO_CONSULTAR_IDENTIDAD)) return;

    this.rucConsultado = ruc;
    this.consultandoPadron.set(true);
    try {
      // Cualquier fallo de la consulta deja el registro manual, como sin padrón (TR-RNF-007).
      const datos = await this.padron.consultarRuc(ruc).catch(() => null);
      if (rucDe(this.grupo) === ruc) this.aplicarPadron(datos);
    } finally {
      this.consultandoPadron.set(false);
    }
  }

  /** «www.empresa.pe» → «https://www.empresa.pe» al salir del campo. */
  protected alSalirDelSitioWeb(): void {
    const sitioWeb = this.grupo.controls.sitioWeb;
    sitioWeb.setValue(completarEsquemaWeb(sitioWeb.value));
  }

  /** El logo subido queda pendiente: se asigna con «Guardar cambios», en el mismo `PUT`. */
  protected async alQuedarDisponible(archivo: ArchivoDisponible): Promise<void> {
    this.elegirLogo(archivo.archivoId);
    this.urlLogo.set(await this.logos.url(archivo.archivoId));
  }

  protected quitarLogo(): void {
    this.elegirLogo(null);
    this.urlLogo.set(null);
    this.reinicioZona.update((reinicio) => reinicio + 1);
  }

  /** TR-RNF-008: trae lo que guardó el otro usuario y descarta lo editado aquí, salvo el logo recién subido. */
  protected recargar(): void {
    if (!this.empresaId) return;
    const logoPendiente = this.logoPendiente() ? this.grupo.controls.logoArchivoId.value : null;
    void this.cargar(this.empresaId).then(async () => {
      if (!logoPendiente) return;
      this.elegirLogo(logoPendiente);
      this.urlLogo.set(await this.logos.url(logoPendiente));
    });
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.grupo.invalid) {
      this.grupo.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);
    this.errorLogo.set(null);
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

  private elegirLogo(archivoId: string | null): void {
    const logo = this.grupo.controls.logoArchivoId;
    logo.setValue(archivoId);
    logo.markAsDirty();
    this.errorLogo.set(null);
  }

  private aplicarPadron(datos: DatosPadronRuc | null): void {
    const razonSocial = this.grupo.controls.razonSocial;
    if (!datos) {
      razonSocial.enable();
      this.noEstaEnPadron.set(true);
      return;
    }
    razonSocial.setValue(datos.razonSocial);
    razonSocial.disable();
    this.motivoNoApto.set(datos.aptoFactura ? null : datos.motivoNoApto);
  }

  /** Un RUC nuevo vuelve a habilitar la razón social y pide otra consulta. */
  private olvidarPadron(): void {
    this.rucConsultado = null;
    this.grupo.controls.razonSocial.enable({ emitEvent: false });
    this.noEstaEnPadron.set(false);
    this.motivoNoApto.set(null);
  }

  private async enviar(): Promise<void> {
    const empresa = this.empresa();
    if (empresa) {
      await this.empresas.editar(empresa.id, empresa.version, aDatosEdicionEmpresa(this.grupo));
      this.avisos.toast('exito', MENSAJES_EMPRESAS.actualizada);
      await this.router.navigate([RUTA_EMPRESAS], { relativeTo: this.rutaMontaje });
      return;
    }

    const { empresaId, advertencias } = await this.empresas.registrar(rucDe(this.grupo), aDatosEmpresa(this.grupo));
    if (advertencias.length > 0) await this.avisos.advertencia(MENSAJES_EMPRESAS.registradaConObservaciones, advertencias.join('\n'));
    // La principal nueva entra al selector de sucursales del shell.
    await this.recargaContexto.recargar();
    // ARC necesita el id de la empresa para subir el logo: el alta pasa a la edición, sin volver atrás al alta.
    await this.router.navigate([RUTA_EMPRESAS, empresaId, RUTA_EDITAR], {
      relativeTo: this.rutaMontaje,
      replaceUrl: true,
      state: { [ESTADO_RECIEN_REGISTRADA]: true },
    });
  }

  private mostrarError(error: unknown): void {
    const errorAdmin = aErrorAdmin(error);
    const motivoLogo = motivoDeLogoInvalido(errorAdmin);
    if (motivoLogo) this.errorLogo.set(MENSAJES_LOGO_INVALIDO[motivoLogo]);
    else if (errorAdmin.codigo === CODIGO_VERSION_OBSOLETA) this.versionObsoleta.set(true);
    else this.error.set(errorAdmin.message);
  }

  private async cargar(empresaId: string): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    this.versionObsoleta.set(false);
    try {
      const empresa = await this.empresas.consultar(empresaId);
      cargarEmpresa(this.grupo, empresa, await this.ubigeos.valorGuardado(this.grupo.controls.ubigeo, empresa.ubigeo));
      this.empresa.set(empresa);
      this.urlLogo.set(await this.logos.url(empresa.logoArchivoId));
    } catch (error) {
      const errorAdmin = aErrorAdmin(error);
      if (errorAdmin.codigo === CODIGO_NO_ENCONTRADO) this.noExiste.set(true);
      else this.error.set(errorAdmin.message);
    } finally {
      this.cargando.set(false);
    }
  }
}
