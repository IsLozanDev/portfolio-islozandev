import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SesionService } from '@vitrina/shared/auth';
import { AccionesFilaDirective, AvisosService, CeldaTablaDirective, PanelLateralService, TablaComponent, type ColumnaTabla } from '@vitrina/shared/ui';
import { firstValueFrom } from 'rxjs';
import { TAMANO_LISTA_FICHA, type CambioFicha, type ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { DireccionPersona, PersonaDetalle } from '../../models/persona';
import { PERMISOS_PERSONAS } from '../../models/permisos-personas';
import { DireccionesCliente } from '../../services/direcciones.cliente';
import { cambioDePanel } from '../../utils/cambios-ficha';
import { OperacionesFicha } from '../../utils/operaciones-ficha';
import { formatoUbigeo } from '../../utils/formato-ubigeo';
import { PanelDireccionComponent, type DatosPanelDireccion } from '../panel-direccion/panel-direccion.component';

export interface FilaDireccion {
  direccion: DireccionPersona;
  texto: string;
  referencia: string;
  ubigeo: string;
  principal: string;
}

const SIN_REFERENCIA = '—';

/**
 * Sección «Direcciones» (TR-RF-041, TR-CA-105): ubigeo como «AREQUIPA / AREQUIPA / CAYMA». Agregar exige
 * además `plat.catalogo.leer`, porque el autocompletar lee el catálogo `UBIGEO`.
 */
@Component({
  selector: 'vit-persona-direcciones',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, AccionesFilaDirective, CeldaTablaDirective, TablaComponent],
  templateUrl: './persona-direcciones.component.html',
  styleUrl: './persona-direcciones.component.css',
})
export class PersonaDireccionesComponent {
  private readonly direcciones = inject(DireccionesCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);
  private readonly sesion = inject(SesionService);

  readonly persona = input.required<PersonaDetalle>();
  readonly cambio = output<CambioFicha>();

  protected readonly mensajes = MENSAJES_FICHA.direcciones;
  protected readonly accionesTexto = MENSAJES_FICHA.contactos;
  protected readonly tamanosPagina = [TAMANO_LISTA_FICHA];
  protected readonly columnas: ColumnaTabla<FilaDireccion>[] = [
    { clave: 'texto', titulo: this.mensajes.direccion, movil: 'titulo' },
    { clave: 'referencia', titulo: this.mensajes.referencia },
    { clave: 'ubigeo', titulo: this.mensajes.ubigeo, movil: 'detalle' },
    { clave: 'principal', titulo: this.mensajes.principal, movil: 'estado' },
  ];
  protected readonly puedeEditar = computed(() => this.sesion.tiene(PERMISOS_PERSONAS.editar));
  protected readonly puedeLeerUbigeos = computed(() => this.sesion.tiene(PERMISOS_PERSONAS.leerCatalogos));
  protected readonly filas = computed(() => this.persona().direcciones.map((direccion) => this.filaDe(direccion)));
  private readonly operaciones = new OperacionesFicha((cambio) => this.cambio.emit(cambio));
  protected readonly ocupado = this.operaciones.ocupado;
  protected readonly error = this.operaciones.error;

  protected agregar(): Promise<void> {
    return this.abrirPanel({ persona: this.persona() });
  }

  protected editar(fila: FilaDireccion): Promise<void> {
    return this.abrirPanel({ persona: this.persona(), direccion: fila.direccion });
  }

  protected marcarPrincipal(fila: FilaDireccion): Promise<void> {
    const persona = this.persona();
    return this.operaciones.correr(() => this.direcciones.editar(persona.id, fila.direccion.id, { version: persona.version, principal: true }));
  }

  protected async eliminar(fila: FilaDireccion): Promise<void> {
    const confirmacion = await this.avisos.confirmarDestructiva({ titulo: this.mensajes.confirmarEliminar, texto: this.mensajes.textoEliminar(fila.texto) });
    if (!confirmacion.confirmado) return;
    const persona = this.persona();
    await this.operaciones.correr(async () => {
      await this.direcciones.eliminar(persona.id, fila.direccion.id, persona.version);
      return null;
    });
  }

  protected etiquetaAccion(accion: string, fila: FilaDireccion): string {
    return `${accion} ${fila.texto}`;
  }

  private async abrirPanel(datos: DatosPanelDireccion): Promise<void> {
    const panel = this.paneles.abrir<PanelDireccionComponent, DatosPanelDireccion, ResultadoPanelFicha>(PanelDireccionComponent, { datos });
    const cambio = cambioDePanel(await firstValueFrom(panel.afterClosed()));
    if (cambio) this.cambio.emit(cambio);
  }

  private filaDe(direccion: DireccionPersona): FilaDireccion {
    return {
      direccion,
      texto: direccion.direccion,
      referencia: direccion.referencia ?? SIN_REFERENCIA,
      ubigeo: formatoUbigeo(direccion),
      principal: direccion.principal ? this.mensajes.principal : '',
    };
  }
}
