import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  AccionesFilaDirective,
  AccionesFormularioComponent,
  AvisosService,
  CargandoComponent,
  EstadoVacioComponent,
  FiltrosComponent,
  MensajeValidacionPipe,
  TablaComponent,
  type CambioOrden,
  type CambioPagina,
  type TipoAviso,
  type ValorFiltros,
} from '@vitrina/shared/ui';
import { COLUMNAS_USUARIOS, filtrarYOrdenar, FILTROS_USUARIOS, USUARIOS_DE_MUESTRA, type UsuarioDeMuestra } from './usuarios-de-muestra';

const TAMANO_PAGINA_INICIAL = 10;
const LONGITUD_MINIMA_NOMBRE = 3;
const DEMORA_GUARDADO_MS = 1000;
const TIPOS_DE_AVISO: readonly TipoAviso[] = ['info', 'exito', 'advertencia', 'error'];
const FILTROS_VACIOS: ValorFiltros = { busqueda: '', estado: null };

/** Solo fuera de producción (`/dev/componentes`): muestra y prueba en navegador los componentes de `shared/ui`. */
@Component({
  selector: 'vit-componentes',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    AccionesFilaDirective,
    AccionesFormularioComponent,
    CargandoComponent,
    EstadoVacioComponent,
    FiltrosComponent,
    MensajeValidacionPipe,
    TablaComponent,
  ],
  templateUrl: './componentes.page.html',
})
export class ComponentesPage {
  private readonly avisos = inject(AvisosService);

  protected readonly tiposDeAviso = TIPOS_DE_AVISO;
  protected readonly columnas = COLUMNAS_USUARIOS;
  protected readonly definicionesFiltro = FILTROS_USUARIOS;

  protected readonly filtros = signal<ValorFiltros>(FILTROS_VACIOS);
  protected readonly orden = signal<CambioOrden | null>(null);
  protected readonly pagina = signal<CambioPagina>({ indice: 0, tamano: TAMANO_PAGINA_INICIAL });
  private readonly usuariosFiltrados = computed(() => filtrarYOrdenar(USUARIOS_DE_MUESTRA, this.filtros(), this.orden()));
  protected readonly total = computed(() => this.usuariosFiltrados().length);
  protected readonly filas = computed(() => {
    const { indice, tamano } = this.pagina();
    return this.usuariosFiltrados().slice(indice * tamano, (indice + 1) * tamano);
  });

  protected readonly guardando = signal(false);
  protected readonly formulario = inject(NonNullableFormBuilder).group({
    nombre: ['', [Validators.required, Validators.minLength(LONGITUD_MINIMA_NOMBRE)]],
    correo: ['', [Validators.required, Validators.email]],
  });

  protected mostrarAviso(tipo: TipoAviso): void {
    const abrirPorTipo: Record<TipoAviso, () => Promise<void>> = {
      info: () => this.avisos.info('Información', 'La sincronización termina a las 18:00.'),
      exito: () => this.avisos.exito('Guardado', 'Los cambios se guardaron.'),
      advertencia: () => this.avisos.advertencia('Atención', 'La suscripción vence en 3 días.'),
      error: () => this.avisos.error('No se pudo guardar', 'Inténtelo de nuevo.'),
    };
    void abrirPorTipo[tipo]();
  }

  protected mostrarToast(tipo: TipoAviso): void {
    this.avisos.toast(tipo, `Toast de tipo ${tipo}`);
  }

  protected async confirmar(): Promise<void> {
    const confirmado = await this.avisos.confirmar({ titulo: '¿Publicar los cambios?', texto: 'Los verán todos los usuarios.' });
    this.avisos.toast('info', confirmado ? 'Confirmado' : 'Cancelado');
  }

  protected async eliminar(usuario: UsuarioDeMuestra): Promise<void> {
    const resultado = await this.avisos.confirmarDestructiva({
      titulo: `¿Suspender a ${usuario.nombre}?`,
      texto: 'Perderá el acceso de inmediato.',
      textoConfirmar: 'Suspender',
      pedirMotivo: true,
    });
    if (!resultado.confirmado) return;
    this.avisos.toast('exito', `Suspendido. Motivo: ${resultado.motivo}`);
  }

  protected filtrar(filtros: ValorFiltros): void {
    this.filtros.set(filtros);
    this.pagina.update((actual) => ({ ...actual, indice: 0 }));
  }

  protected async guardar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    this.guardando.set(true);
    await new Promise((resolver) => setTimeout(resolver, DEMORA_GUARDADO_MS));
    this.guardando.set(false);
    this.avisos.toast('exito', 'Formulario guardado');
  }

  protected cancelar(): void {
    this.formulario.reset();
  }
}
