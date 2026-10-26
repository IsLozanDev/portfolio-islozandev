import { Component, inject, signal, type OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CONFIG_AUTH, PARAMETRO_RETORNO, SesionService } from '@vitrina/shared/auth';
import { ErrorInvitacion, type EstadoInvitacion } from '../../models/invitacion';
import { InvitacionCliente } from '../../services/invitacion.cliente';
import { mensajeDeError } from '../../utils/mensaje-de-error';
import { clavesCoinciden, ERROR_CLAVES_DISTINTAS, LONGITUD_MINIMA_CLAVE } from '../../utils/validadores-clave';

const PARAMETRO_TOKEN = 'token';
const PARAMETRO_TOKEN_HASH = 'token_hash';
const PARAMETRO_TIPO = 'type';
/** `invite`: usuario nuevo, sin clave. `email`: enlace mágico a quien ya tenía cuenta. */
const TIPOS_DE_ENLACE = ['invite', 'email'] as const;
const TIPO_USUARIO_NUEVO = 'invite';

type TipoEnlaceInvitacion = (typeof TIPOS_DE_ENLACE)[number];
type EstadoPaginaInvitacion = 'cargando' | 'sin-sesion' | 'clave' | 'aceptar' | 'no-disponible';

/** TR-RF-010: el invitado abre el enlace, se autentica y acepta (spec 08). */
@Component({
  selector: 'vit-invitacion',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './invitacion.page.html',
})
export class InvitacionPage implements OnInit {
  private readonly sesion = inject(SesionService);
  private readonly cliente = inject(InvitacionCliente);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly rutas = inject(CONFIG_AUTH).rutas;
  private readonly token = this.ruta.snapshot.queryParamMap.get(PARAMETRO_TOKEN);
  private usuarioNuevo = false;

  protected readonly rutaIngresar = this.rutas.ingresar;
  protected readonly parametrosIngresar = { [PARAMETRO_RETORNO]: this.urlDeEstaInvitacion() };
  protected readonly longitudMinima = LONGITUD_MINIMA_CLAVE;
  protected readonly errorClavesDistintas = ERROR_CLAVES_DISTINTAS;
  protected readonly estado = signal<EstadoPaginaInvitacion>('cargando');
  protected readonly invitacion = signal<EstadoInvitacion | null>(null);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formulario = inject(NonNullableFormBuilder).group(
    {
      clave: ['', [Validators.required, Validators.minLength(LONGITUD_MINIMA_CLAVE)]],
      confirmacion: ['', Validators.required],
    },
    { validators: clavesCoinciden },
  );

  async ngOnInit(): Promise<void> {
    if (!this.token) {
      this.mostrarNoDisponible(new ErrorInvitacion('INVITACION_NO_ENCONTRADA'));
      return;
    }
    try {
      this.invitacion.set(await this.cliente.consultar(this.token));
    } catch (error) {
      this.mostrarNoDisponible(error);
      return;
    }
    await this.canjearEnlaceDelCorreo();
    this.estado.set(this.siguientePaso());
  }

  protected async guardarClaveYAceptar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    await this.ejecutar(async () => {
      await this.sesion.actualizarClave(this.formulario.getRawValue().clave);
      this.usuarioNuevo = false;
      this.estado.set('aceptar');
      await this.aceptarYEntrar();
    });
  }

  protected async aceptar(): Promise<void> {
    await this.ejecutar(() => this.aceptarYEntrar());
  }

  /** Sin `token_hash` en la URL el invitado llegó de otra forma (p. ej. tras ingresar): no hay nada que canjear. */
  private async canjearEnlaceDelCorreo(): Promise<void> {
    const parametros = this.ruta.snapshot.queryParamMap;
    const tokenHash = parametros.get(PARAMETRO_TOKEN_HASH);
    const tipo = tipoDeEnlace(parametros.get(PARAMETRO_TIPO));
    if (!tokenHash || !tipo) return;
    try {
      await this.sesion.verificarEnlace(tokenHash, tipo);
      this.usuarioNuevo = tipo === TIPO_USUARIO_NUEVO;
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
    await this.quitarEnlaceDeLaUrl();
  }

  private siguientePaso(): EstadoPaginaInvitacion {
    if (!this.sesion.autenticado()) return 'sin-sesion';
    return this.usuarioNuevo ? 'clave' : 'aceptar';
  }

  /** El token nuevo trae el `tenant_id` recién aceptado (hook de Supabase) y recarga el contexto. */
  private async aceptarYEntrar(): Promise<void> {
    if (!this.token) throw new ErrorInvitacion('INVITACION_NO_ENCONTRADA');
    await this.cliente.aceptar(this.token);
    await this.sesion.refrescarSesion();
    await this.router.navigateByUrl(this.rutas.inicio);
  }

  private async ejecutar(accion: () => Promise<void>): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);
    try {
      await accion();
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.enviando.set(false);
    }
  }

  private mostrarNoDisponible(error: unknown): void {
    this.error.set(mensajeDeError(error));
    this.estado.set('no-disponible');
  }

  /** El `token_hash` ya se usó: que no quede en el historial; el `token` de la invitación sí sigue. */
  private quitarEnlaceDeLaUrl(): Promise<boolean> {
    return this.router.navigate([], { relativeTo: this.ruta, queryParams: { [PARAMETRO_TOKEN]: this.token }, replaceUrl: true });
  }

  private urlDeEstaInvitacion(): string {
    const arbol = this.router.createUrlTree([], { relativeTo: this.ruta, queryParams: { [PARAMETRO_TOKEN]: this.token } });
    return this.router.serializeUrl(arbol);
  }
}

function tipoDeEnlace(valor: string | null): TipoEnlaceInvitacion | null {
  return TIPOS_DE_ENLACE.find((tipo) => tipo === valor) ?? null;
}
