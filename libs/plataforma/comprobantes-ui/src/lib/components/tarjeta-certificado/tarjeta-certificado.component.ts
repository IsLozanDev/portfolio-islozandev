import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SiPermisoDirective } from '@vitrina/shared/auth';
import { ChipEstadoComponent } from '@vitrina/shared/ui';
import type { Emisor } from '../../models/emisor';
import { AYUDA_CERTIFICADO_OPCIONAL, MENSAJES_EMISOR, mensajeErrorFe } from '../../models/mensajes-emisor';
import { PERMISOS_FE_UI } from '../../models/permisos-fe';
import { formatoFechaCorta } from '../../utils/fechas';
import { BYTES_POR_KB, EXTENSIONES_CERTIFICADO, validarArchivoCertificado } from '../../utils/validar-certificado';
import { avisoVencimiento } from '../../utils/vencimiento-certificado';

export interface CargaCertificado {
  archivo: File;
  clave: string;
}

/** Primeros y últimos grupos de la huella que se muestran: «9f3a 41c0 … 7e2c c21b». */
const GRUPOS_VISIBLES_HUELLA = 2;
const LARGO_GRUPO_HUELLA = 4;

/** Tarjeta 2: el .pfx sube por multipart a la API (spec 49); se valida extensión y tamaño antes de subir. */
@Component({
  selector: 'vit-tarjeta-certificado',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, ChipEstadoComponent, SiPermisoDirective],
  templateUrl: './tarjeta-certificado.component.html',
})
export class TarjetaCertificadoComponent {
  readonly emisor = input.required<Emisor | null>();
  readonly requiereCertificado = input<boolean>(true);
  readonly ahora = input.required<Date>();
  readonly subiendo = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly subir = output<CargaCertificado>();

  protected readonly mensajes = MENSAJES_EMISOR.certificado;
  protected readonly permisos = PERMISOS_FE_UI;
  protected readonly ayudaOpcional = AYUDA_CERTIFICADO_OPCIONAL;
  protected readonly aceptar = EXTENSIONES_CERTIFICADO.join(',');

  /** No existe en solo lectura (`*siPermiso`). */
  private readonly selector = viewChild<ElementRef<HTMLInputElement>>('selector');
  protected readonly archivo = signal<File | null>(null);
  /** Nunca se rellena ni se guarda fuera del componente. */
  protected readonly clave = signal('');
  protected readonly errorArchivo = signal<string | null>(null);

  protected readonly certificado = computed(() => this.emisor()?.certificado ?? null);
  protected readonly vence = computed(() => {
    const certificado = this.certificado();
    return certificado ? formatoFechaCorta(certificado.venceEn) : '';
  });
  protected readonly aviso = computed(() => {
    const certificado = this.certificado();
    return certificado ? avisoVencimiento(certificado.venceEn, this.ahora()) : null;
  });
  protected readonly huella = computed(() => huellaAbreviada(this.certificado()?.huellaSha256 ?? ''));
  protected readonly tamano = computed(() => {
    const archivo = this.archivo();
    return archivo ? `${Math.ceil(archivo.size / BYTES_POR_KB)} KB` : '';
  });
  protected readonly puedeSubir = computed(() => this.archivo() !== null && this.clave().trim() !== '' && !this.subiendo());
  protected readonly errorVisible = computed(() => this.errorArchivo() ?? this.error());

  protected elegirArchivo(): void {
    this.selector()?.nativeElement.click();
  }

  protected alElegir(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    if (!archivo) return;
    const codigoError = validarArchivoCertificado(archivo);
    this.errorArchivo.set(codigoError && mensajeErrorFe(codigoError));
    this.archivo.set(codigoError ? null : archivo);
  }

  protected enviar(): void {
    const archivo = this.archivo();
    if (!archivo || !this.puedeSubir()) return;
    this.subir.emit({ archivo, clave: this.clave() });
  }

  /** Tras subir con éxito: el archivo y la clave no se quedan en memoria. */
  limpiar(): void {
    this.archivo.set(null);
    this.clave.set('');
    this.errorArchivo.set(null);
    const selector = this.selector()?.nativeElement;
    if (selector) selector.value = '';
  }
}

function huellaAbreviada(huella: string): string {
  const grupos = huella.match(new RegExp(`.{1,${LARGO_GRUPO_HUELLA}}`, 'g')) ?? [];
  if (grupos.length <= GRUPOS_VISIBLES_HUELLA * 2) return grupos.join(' ');
  return [...grupos.slice(0, GRUPOS_VISIBLES_HUELLA), '…', ...grupos.slice(-GRUPOS_VISIBLES_HUELLA)].join(' ');
}
