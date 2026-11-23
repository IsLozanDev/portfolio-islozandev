import { Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AccionesFormularioComponent, ChipEstadoComponent, MensajeValidacionPipe, PanelLateralComponent } from '@vitrina/shared/ui';
import type { PedidoAlta } from '../../models/buscador';
import { aErrorPersonas } from '../../models/error-personas';
import { ETIQUETAS_TIPO_DOCUMENTO, ETIQUETAS_TIPO_PERSONA } from '../../models/etiquetas-personas';
import { MENSAJES_ALTA } from '../../models/mensajes-buscador';
import {
  fuenteDeIdentidad,
  MENSAJES_CELULAR,
  MENSAJES_CORREO,
  mensajeDeError,
  TEXTO_SIN_CONSULTA_EN_LINEA,
  textoAvisoIdentidad,
} from '../../models/mensajes-personas';
import type { PersonaDetalle, TipoPersona } from '../../models/persona';
import type { RegistroPersona } from '../../models/solicitudes-persona';
import { PersonasCliente } from '../../services/personas.cliente';
import { esDocumentoDeJuridica } from '../../utils/denominacion';
import { celularValido, correoValido } from '../../utils/validadores-formulario';

/** Los mismos límites del dominio (spec 31). */
const LONGITUD_NOMBRES = 100;
const LONGITUD_APELLIDO = 60;
const LONGITUD_RAZON_SOCIAL = 200;
const CODIGO_DUPLICADA = 'PERSONA_DUPLICADA';
const TIPOS_SIN_CONSULTA = ['CE', 'PASAPORTE'];

/**
 * Paso «Registrar persona» del panel lateral (TR-RF-039): documento bloqueado, tipo de persona deducido
 * (RUC 20 → jurídica), prellenado editable, celular obligatorio y correo opcional. Va dentro de un MatDialog.
 */
@Component({
  selector: 'vit-persona-alta',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    AccionesFormularioComponent,
    ChipEstadoComponent,
    MensajeValidacionPipe,
    PanelLateralComponent,
  ],
  templateUrl: './persona-alta.component.html',
  styleUrl: './persona-alta.component.css',
})
export class PersonaAltaComponent implements OnInit {
  private readonly personas = inject(PersonasCliente);

  readonly pedido = input.required<PedidoAlta>();

  readonly registrada = output<PersonaDetalle>();
  /** «Abrir su ficha» tras un PERSONA_DUPLICADA: el id de la persona que ya tiene el documento. */
  readonly existente = output<string>();
  readonly volver = output<void>();
  readonly cancelar = output<void>();

  protected readonly mensajes = MENSAJES_ALTA;
  protected readonly mensajesCelular = MENSAJES_CELULAR;
  protected readonly mensajesCorreo = MENSAJES_CORREO;
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    nombres: ['', [Validators.required, Validators.maxLength(LONGITUD_NOMBRES)]],
    apellidoPaterno: ['', [Validators.required, Validators.maxLength(LONGITUD_APELLIDO)]],
    apellidoMaterno: ['', Validators.maxLength(LONGITUD_APELLIDO)],
    razonSocial: ['', [Validators.required, Validators.maxLength(LONGITUD_RAZON_SOCIAL)]],
    celular: ['', [Validators.required, celularValido]],
    correo: ['', correoValido],
  });
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duplicadaId = signal<string | null>(null);

  protected readonly juridica = computed(() => esDocumentoDeJuridica(this.pedido().tipoDocumento, this.pedido().numeroDocumento));
  protected readonly tipoPersona = computed<TipoPersona>(() => (this.juridica() ? 'JURIDICA' : 'NATURAL'));
  protected readonly textoTipoPersona = computed(() => ETIQUETAS_TIPO_PERSONA[this.tipoPersona()]);
  protected readonly documento = computed(() => `${ETIQUETAS_TIPO_DOCUMENTO[this.pedido().tipoDocumento]} ${this.pedido().numeroDocumento}`);
  protected readonly fuente = computed(() => (this.pedido().prellenado ? fuenteDeIdentidad(this.pedido().tipoDocumento) : null));
  protected readonly aviso = computed(() => {
    const { prellenado, aviso, tipoDocumento } = this.pedido();
    if (prellenado) return null;
    if (TIPOS_SIN_CONSULTA.includes(tipoDocumento)) return { texto: TEXTO_SIN_CONSULTA_EN_LINEA, advertencia: false };
    if (!aviso) return null;
    return { texto: textoAvisoIdentidad(aviso, tipoDocumento), advertencia: aviso !== 'NO_ENCONTRADO_EN_IDENTIDAD' };
  });

  ngOnInit(): void {
    const { prellenado } = this.pedido();
    const controles = this.formulario.controls;
    const sobran = this.juridica() ? [controles.nombres, controles.apellidoPaterno, controles.apellidoMaterno] : [controles.razonSocial];
    for (const control of sobran) control.disable();
    if (!prellenado) return;
    this.formulario.patchValue({
      nombres: prellenado.nombres ?? '',
      apellidoPaterno: prellenado.apellidoPaterno ?? '',
      apellidoMaterno: prellenado.apellidoMaterno ?? '',
      razonSocial: prellenado.razonSocial ?? '',
    });
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    this.error.set(null);
    this.duplicadaId.set(null);
    try {
      this.registrada.emit(await this.personas.registrar(this.registro()));
    } catch (falla) {
      const error = aErrorPersonas(falla);
      if (error.codigo === CODIGO_DUPLICADA && error.personaId) this.duplicadaId.set(error.personaId);
      else this.error.set(mensajeDeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  protected abrirExistente(personaId: string): void {
    this.existente.emit(personaId);
  }

  /** Textos recortados; el materno y el correo vacíos no viajan. Los campos deshabilitados no entran. */
  private registro(): RegistroPersona {
    const valores = this.formulario.getRawValue();
    const { tipoDocumento, numeroDocumento } = this.pedido();
    const base = { tipoPersona: this.tipoPersona(), tipoDocumento, numeroDocumento, celular: valores.celular.trim(), correo: valores.correo.trim() || undefined };
    if (this.juridica()) return { ...base, razonSocial: valores.razonSocial.trim() };
    return {
      ...base,
      nombres: valores.nombres.trim(),
      apellidoPaterno: valores.apellidoPaterno.trim(),
      apellidoMaterno: valores.apellidoMaterno.trim() || undefined,
    };
  }
}
