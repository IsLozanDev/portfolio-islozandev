import { Component, computed, inject, signal, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { MarcoAuthComponent } from '@vitrina/shared/auth-ui';
import { AvisosService, CargandoComponent, EstadoVacioComponent } from '@vitrina/shared/ui';
import {
  aErrorPreferencias,
  BAJA_PROMOCIONES,
  BAJA_TODO_EL_CORREO,
  MENSAJES_PREFERENCIAS,
  type AlcanceBaja,
} from '../../models/preferencias';
import { PreferenciasCliente } from '../../services/preferencias.cliente';
import { tokenDelFragmento } from '../../utils/token-del-fragmento';

type EstadoPagina = 'cargando' | 'invalido' | 'preferencias' | 'confirmada';

const ICONO_ENLACE_INVALIDO = 'link_off';

const CONFIRMACION_TODO_EL_CORREO = {
  titulo: '¿Dejar de recibir todos los correos?',
  texto: 'También dejará de recibir recordatorios de citas y comprobantes por correo. Para volver a recibirlos tendrá que pedirlo al negocio.',
  textoConfirmar: 'Sí, dejar todos los correos',
  textoCancelar: 'Cancelar',
} as const;

const CONFIRMADA_POR_BAJA: Readonly<Record<AlcanceBaja, string>> = {
  PROMOCIONAL: 'Ya no recibirá promociones en',
  CANAL: 'Ya no recibirá correos en',
};

/**
 * TR-RF-077: el destinatario abre el enlace del pie de un correo y se da de baja de las promociones o de todo el
 * correo. Sin sesión: lo autoriza el token del fragmento, que se quita de la barra en cuanto se lee.
 */
@Component({
  selector: 'vit-preferencias',
  imports: [MarcoAuthComponent, CargandoComponent, EstadoVacioComponent, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './preferencias.page.html',
})
export class PreferenciasPage implements OnInit {
  private readonly cliente = inject(PreferenciasCliente);
  private readonly avisos = inject(AvisosService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly token = tokenDelFragmento(this.ruta.snapshot.fragment);

  protected readonly mensajes = MENSAJES_PREFERENCIAS;
  protected readonly iconoEnlaceInvalido = ICONO_ENLACE_INVALIDO;
  protected readonly bajaPromociones = BAJA_PROMOCIONES;
  protected readonly bajaTodoElCorreo = BAJA_TODO_EL_CORREO;
  protected readonly estado = signal<EstadoPagina>('cargando');
  protected readonly destino = signal('');
  protected readonly bajas = signal<readonly AlcanceBaja[]>([]);
  protected readonly enviando = signal<AlcanceBaja | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmada = signal<string>('');

  protected readonly sinTodoElCorreo = computed(() => this.bajas().includes(BAJA_TODO_EL_CORREO));
  protected readonly sinPromociones = computed(() => this.sinTodoElCorreo() || this.bajas().includes(BAJA_PROMOCIONES));

  async ngOnInit(): Promise<void> {
    await this.quitarTokenDeLaBarra();
    if (!this.token) {
      this.estado.set('invalido');
      return;
    }
    try {
      const preferencias = await this.cliente.consultar(this.token);
      this.destino.set(preferencias.destinoEnmascarado);
      this.bajas.set(preferencias.bajas);
      this.estado.set('preferencias');
    } catch {
      this.estado.set('invalido');
    }
  }

  protected dejarPromociones(): Promise<void> {
    return this.darseDeBaja(BAJA_PROMOCIONES);
  }

  protected async dejarTodoElCorreo(): Promise<void> {
    const confirmacion = await this.avisos.confirmarDestructiva(CONFIRMACION_TODO_EL_CORREO);
    if (!confirmacion.confirmado) return;
    await this.darseDeBaja(BAJA_TODO_EL_CORREO);
  }

  private async darseDeBaja(baja: AlcanceBaja): Promise<void> {
    if (!this.token) return;
    this.enviando.set(baja);
    this.error.set(null);
    try {
      const resultado = await this.cliente.darseDeBaja(this.token, baja);
      this.bajas.set(resultado.bajas);
      this.confirmada.set(CONFIRMADA_POR_BAJA[baja]);
      this.estado.set('confirmada');
    } catch (error) {
      this.mostrarError(error);
    } finally {
      this.enviando.set(null);
    }
  }

  private mostrarError(error: unknown): void {
    const errorPreferencias = aErrorPreferencias(error);
    if (errorPreferencias.enlaceInvalido) {
      this.estado.set('invalido');
      return;
    }
    this.error.set(errorPreferencias.message);
  }

  /** El token no queda en el historial ni en una captura de la barra (`replaceUrl` usa `history.replaceState`). */
  private quitarTokenDeLaBarra(): Promise<boolean> {
    return this.router.navigate([], { relativeTo: this.ruta, replaceUrl: true });
  }
}
