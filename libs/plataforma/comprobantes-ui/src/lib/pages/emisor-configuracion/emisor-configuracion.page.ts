import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SesionService } from '@vitrina/shared/auth';
import {
  AvisosService,
  CargandoComponent,
  ChipEstadoComponent,
  EstadoVacioComponent,
  GrupoPlegableComponent,
  SeccionEntradaDirective,
  SeccionFinDirective,
  SeccionPlegableComponent,
} from '@vitrina/shared/ui';
import type { Subscription } from 'rxjs';
import { EntradaSeccionComponent } from '../../components/entrada-seccion/entrada-seccion.component';
import { TarjetaCertificadoComponent, type CargaCertificado } from '../../components/tarjeta-certificado/tarjeta-certificado.component';
import { TarjetaProduccionComponent } from '../../components/tarjeta-produccion/tarjeta-produccion.component';
import { TarjetaProveedorComponent } from '../../components/tarjeta-proveedor/tarjeta-proveedor.component';
import { TarjetaPruebaComponent } from '../../components/tarjeta-prueba/tarjeta-prueba.component';
import type { CargaConfigurarEmisor, Emisor, EmpresaConEmisor } from '../../models/emisor';
import { aErrorFe } from '../../models/error-fe';
import { ETIQUETAS_AMBIENTE, ETIQUETAS_ESTADO_EMISOR, ETIQUETAS_PRUEBA, ETIQUETA_SIN_EMISOR, TONO_SIN_EMISOR, TONOS_ESTADO_EMISOR, TONOS_PRUEBA } from '../../models/estado-emisor';
import { CODIGOS_ERROR_FE, MENSAJES_EMISOR } from '../../models/mensajes-emisor';
import { PERMISOS_FE_UI } from '../../models/permisos-fe';
import { PROVEEDOR_SIMULADO } from '../../models/proveedor-fe';
import { EmisoresCliente } from '../../services/emisores.cliente';
import { ProveedoresFeService } from '../../services/proveedores-fe.service';
import { SeguimientoPruebaService } from '../../services/seguimiento-prueba.service';
import { certificadoHabilitado, pruebaEnProceso, seccionesIniciales, type SeccionEmisor, type SeccionesExpandidas } from '../../utils/reglas-emisor';
import { resumenCertificado, resumenProduccion, resumenProveedor, resumenPrueba, seccionHecha } from '../../utils/resumenes-emisor';
import { avisoVencimiento } from '../../utils/vencimiento-certificado';

export const PARAMETRO_EMPRESA_ID = 'empresaId';
const CODIGO_PROVEEDOR_FE_INVALIDO = 'PROVEEDOR_FE_INVALIDO';
const SECCIONES: readonly SeccionEmisor[] = ['proveedor', 'certificado', 'prueba', 'produccion'];
const NUMERO_DE_SECCION: Record<SeccionEmisor, number> = { proveedor: 1, certificado: 2, prueba: 3, produccion: 4 };
const ESTADOS_SIN_PRODUCCION = new Set([undefined, 'BORRADOR', 'CONFIGURADO']);

type Empresa = Omit<EmpresaConEmisor, 'emisor'>;
type ErroresPorSeccion = Partial<Record<SeccionEmisor, string>>;

/** La página del emisor de una empresa: cuatro secciones plegables en orden (spec 62, UI de TR-RF-052). */
@Component({
  selector: 'vit-emisor-configuracion',
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    CargandoComponent,
    EntradaSeccionComponent,
    ChipEstadoComponent,
    EstadoVacioComponent,
    GrupoPlegableComponent,
    SeccionEntradaDirective,
    SeccionFinDirective,
    SeccionPlegableComponent,
    TarjetaCertificadoComponent,
    TarjetaProduccionComponent,
    TarjetaProveedorComponent,
    TarjetaPruebaComponent,
  ],
  templateUrl: './emisor-configuracion.page.html',
})
export class EmisorConfiguracionPage {
  private readonly emisores = inject(EmisoresCliente);
  private readonly proveedoresFe = inject(ProveedoresFeService);
  private readonly seguimiento = inject(SeguimientoPruebaService);
  private readonly avisos = inject(AvisosService);
  private readonly sesion = inject(SesionService);
  private readonly destruccion = inject(DestroyRef);
  private readonly tarjetaCertificado = viewChild(TarjetaCertificadoComponent);
  private consultaPrueba: Subscription | null = null;

  protected readonly empresaId = inject(ActivatedRoute).snapshot.paramMap.get(PARAMETRO_EMPRESA_ID) ?? '';
  protected readonly mensajes = MENSAJES_EMISOR;
  protected readonly numeroDe = NUMERO_DE_SECCION;

  protected readonly cargando = signal(true);
  protected readonly empresa = signal<Empresa | null>(null);
  protected readonly emisor = signal<Emisor | null>(null);
  protected readonly ahora = signal(new Date());
  protected readonly expandidas = signal<SeccionesExpandidas>(seccionesIniciales(null, new Date()));
  protected readonly errores = signal<ErroresPorSeccion>({});
  /** La sección donde llegó DATOS_EMISOR_INCOMPLETOS: muestra el enlace a la empresa. */
  protected readonly seccionDatosIncompletos = signal<SeccionEmisor | null>(null);
  protected readonly errorCarga = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly solicitando = signal(false);
  protected readonly pasando = signal(false);
  protected readonly consultaAgotada = signal(false);

  protected readonly proveedores = this.proveedoresFe.proveedores;
  protected readonly soloLectura = computed(() => !this.sesion.tiene(PERMISOS_FE_UI.configurar));
  private readonly proveedorActual = computed(() => this.proveedoresFe.porCodigo(this.emisor()?.proveedor ?? ''));
  protected readonly requiereCertificado = computed(() => this.proveedorActual()?.requiereCertificado ?? true);

  protected readonly encabezado = computed(() => {
    const emisor = this.emisor();
    if (!emisor) return { estado: ETIQUETA_SIN_EMISOR, tono: TONO_SIN_EMISOR, ambiente: null };
    return { estado: ETIQUETAS_ESTADO_EMISOR[emisor.estado], tono: TONOS_ESTADO_EMISOR[emisor.estado], ambiente: ETIQUETAS_AMBIENTE[emisor.ambiente] };
  });
  protected readonly resumenes = computed<Record<SeccionEmisor, string>>(() => {
    const emisor = this.emisor();
    return {
      proveedor: resumenProveedor(emisor, this.proveedorActual()?.nombre ?? emisor?.proveedor ?? ''),
      certificado: resumenCertificado(emisor),
      prueba: resumenPrueba(emisor),
      produccion: resumenProduccion(emisor, this.ahora()),
    };
  });
  protected readonly deshabilitadas = computed<Record<SeccionEmisor, boolean>>(() => {
    const emisor = this.emisor();
    return {
      proveedor: false,
      certificado: !certificadoHabilitado(emisor),
      prueba: !emisor || emisor.estado === 'BORRADOR',
      produccion: ESTADOS_SIN_PRODUCCION.has(emisor?.estado),
    };
  });
  protected readonly hechas = computed(() => {
    const emisor = this.emisor();
    return Object.fromEntries(SECCIONES.map((seccion) => [seccion, seccionHecha(seccion, emisor)])) as Record<SeccionEmisor, boolean>;
  });
  protected readonly avisoCertificado = computed(() => {
    const certificado = this.emisor()?.certificado;
    return certificado ? avisoVencimiento(certificado.venceEn, this.ahora()) : null;
  });
  protected readonly chipPrueba = computed(() => {
    const prueba = this.emisor()?.prueba;
    return prueba ? { texto: ETIQUETAS_PRUEBA[prueba.estado], tono: TONOS_PRUEBA[prueba.estado] } : null;
  });

  constructor() {
    void this.cargar();
  }

  protected alternar(seccion: SeccionEmisor, expandida: boolean): void {
    this.expandidas.update((expandidas) => ({ ...expandidas, [seccion]: expandida }));
  }

  protected async guardarProveedor(carga: CargaConfigurarEmisor): Promise<void> {
    this.limpiarError('proveedor');
    this.guardando.set(true);
    try {
      const emisor = await this.emisores.configurar(this.empresaId, carga);
      this.aplicar(emisor);
      // Se contrae y abre el paso siguiente pendiente.
      this.expandidas.set({ ...seccionesIniciales(emisor, this.ahora()), proveedor: false });
      this.avisos.toast('exito', MENSAJES_EMISOR.proveedor.guardado);
    } catch (error) {
      this.manejarError('proveedor', error, carga.proveedor);
    } finally {
      this.guardando.set(false);
    }
  }

  protected async subirCertificado({ archivo, clave }: CargaCertificado): Promise<void> {
    this.limpiarError('certificado');
    this.subiendo.set(true);
    try {
      this.aplicar(await this.emisores.cargarCertificado(this.empresaId, archivo, clave));
      this.tarjetaCertificado()?.limpiar();
      this.avisos.toast('exito', MENSAJES_EMISOR.certificado.subido);
    } catch (error) {
      // El emisor no cambia: el certificado anterior se sigue viendo (TR-CA-134).
      this.manejarError('certificado', error);
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async ejecutarPrueba(): Promise<void> {
    this.limpiarError('prueba');
    this.solicitando.set(true);
    try {
      this.aplicar(await this.emisores.solicitarPrueba(this.empresaId));
      this.alternar('prueba', true);
      this.seguirPrueba();
    } catch (error) {
      this.manejarError('prueba', error);
    } finally {
      this.solicitando.set(false);
    }
  }

  protected seguirPrueba(): void {
    this.consultaPrueba?.unsubscribe();
    this.consultaAgotada.set(false);
    this.consultaPrueba = this.seguimiento
      .seguir(this.empresaId)
      .pipe(takeUntilDestroyed(this.destruccion))
      .subscribe({
        next: ({ emisor, agotado }) => {
          this.aplicar(emisor);
          this.consultaAgotada.set(agotado);
        },
        error: (error: unknown) => this.manejarError('prueba', error),
      });
  }

  protected async pasarAProduccion(): Promise<void> {
    const empresa = this.empresa();
    if (!empresa) return;
    const { confirmado } = await this.avisos.confirmarDestructiva({
      titulo: MENSAJES_EMISOR.produccion.confirmarTitulo,
      texto: MENSAJES_EMISOR.produccion.confirmarTexto(empresa.razonSocial, empresa.ruc),
      textoConfirmar: MENSAJES_EMISOR.produccion.pasar,
    });
    if (!confirmado) return;
    this.limpiarError('produccion');
    this.pasando.set(true);
    try {
      this.aplicar(await this.emisores.pasarAProduccion(this.empresaId));
      this.avisos.toast('exito', MENSAJES_EMISOR.produccion.hecho);
    } catch (error) {
      this.manejarError('produccion', error);
    } finally {
      this.pasando.set(false);
    }
  }

  private async cargar(): Promise<void> {
    try {
      // El nombre de la empresa sale de la lista: el rol no tiene `plat.organizacion.consultar`.
      const [empresas, emisor] = await Promise.all([this.emisores.listar(), this.emisores.obtener(this.empresaId), this.cargarProveedores()]);
      const empresa = empresas.find((candidata) => candidata.empresaId === this.empresaId);
      if (!empresa) return;
      this.empresa.set({ empresaId: empresa.empresaId, ruc: empresa.ruc, razonSocial: empresa.razonSocial });
      this.aplicar(emisor);
      this.expandidas.set(seccionesIniciales(emisor, this.ahora()));
      if (pruebaEnProceso(emisor)) this.seguirPrueba();
    } catch (error) {
      this.errorCarga.set(aErrorFe(error).message);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Sin `plat.catalogo.leer` la página sigue: el selector de proveedor queda vacío y la tarjeta lo avisa. */
  private cargarProveedores(): Promise<void> {
    return this.proveedoresFe.cargar().catch(() => undefined);
  }

  private async recargar(): Promise<void> {
    try {
      this.aplicar(await this.emisores.obtener(this.empresaId));
    } catch (error) {
      this.errorCarga.set(aErrorFe(error).message);
    }
  }

  private aplicar(emisor: Emisor | null): void {
    this.emisor.set(emisor);
    this.ahora.set(new Date());
  }

  private manejarError(seccion: SeccionEmisor, error: unknown, proveedorEnviado?: string): void {
    const { codigo, message } = aErrorFe(error);
    if (codigo === CODIGOS_ERROR_FE.versionObsoleta) {
      this.avisos.toast('advertencia', message);
      void this.recargar();
      return;
    }
    if (codigo === CODIGO_PROVEEDOR_FE_INVALIDO && proveedorEnviado === PROVEEDOR_SIMULADO) this.proveedoresFe.descartar(PROVEEDOR_SIMULADO);
    this.seccionDatosIncompletos.set(codigo === CODIGOS_ERROR_FE.datosEmisorIncompletos ? seccion : null);
    this.errores.update((errores) => ({ ...errores, [seccion]: message }));
    // Un error expande la sección donde ocurrió.
    this.alternar(seccion, true);
  }

  private limpiarError(seccion: SeccionEmisor): void {
    this.errores.update((errores) => ({ ...errores, [seccion]: undefined }));
    if (this.seccionDatosIncompletos() === seccion) this.seccionDatosIncompletos.set(null);
  }
}
