import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SesionService } from '@vitrina/shared/auth';
import { AccionesFilaDirective, AvisosService, CeldaTablaDirective, PanelLateralService, TablaComponent, type ColumnaTabla } from '@vitrina/shared/ui';
import { firstValueFrom } from 'rxjs';
import { ETIQUETAS_TIPO_CONTACTO } from '../../models/etiquetas-personas';
import { TAMANO_LISTA_FICHA, type CambioFicha, type ResultadoPanelFicha } from '../../models/ficha';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { ContactoPersona, PersonaDetalle } from '../../models/persona';
import { PERMISOS_PERSONAS } from '../../models/permisos-personas';
import { ContactosCliente } from '../../services/contactos.cliente';
import { cambioDePanel } from '../../utils/cambios-ficha';
import { OperacionesFicha } from '../../utils/operaciones-ficha';
import { formatoContacto } from '../../utils/formato-contacto';
import { PanelContactoComponent, type DatosPanelContacto } from '../panel-contacto/panel-contacto.component';

export interface FilaContacto {
  contacto: ContactoPersona;
  tipo: string;
  valor: string;
  principal: string;
  /** El celular principal no se borra ni se desmarca: la persona siempre conserva uno. */
  borrable: boolean;
}


/** Sección «Contactos» (TR-RF-041): un principal por tipo; marcar, editar y borrar con `plat.persona.editar`. */
@Component({
  selector: 'vit-persona-contactos',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, AccionesFilaDirective, CeldaTablaDirective, TablaComponent],
  templateUrl: './persona-contactos.component.html',
  styleUrl: './persona-contactos.component.css',
})
export class PersonaContactosComponent {
  private readonly contactos = inject(ContactosCliente);
  private readonly paneles = inject(PanelLateralService);
  private readonly avisos = inject(AvisosService);
  private readonly sesion = inject(SesionService);

  readonly persona = input.required<PersonaDetalle>();
  readonly cambio = output<CambioFicha>();

  protected readonly mensajes = MENSAJES_FICHA.contactos;
  protected readonly tamanosPagina = [TAMANO_LISTA_FICHA];
  protected readonly columnas: ColumnaTabla<FilaContacto>[] = [
    { clave: 'tipo', titulo: this.mensajes.tipo, movil: 'detalle' },
    { clave: 'valor', titulo: this.mensajes.valor, movil: 'titulo' },
    { clave: 'principal', titulo: this.mensajes.principal, movil: 'estado' },
  ];
  protected readonly puedeEditar = computed(() => this.sesion.tiene(PERMISOS_PERSONAS.editar));
  protected readonly filas = computed(() => this.persona().contactos.map((contacto) => this.filaDe(contacto)));
  private readonly operaciones = new OperacionesFicha((cambio) => this.cambio.emit(cambio));
  protected readonly ocupado = this.operaciones.ocupado;
  protected readonly error = this.operaciones.error;

  protected agregar(): Promise<void> {
    return this.abrirPanel({ persona: this.persona() });
  }

  protected editar(fila: FilaContacto): Promise<void> {
    return this.abrirPanel({ persona: this.persona(), contacto: fila.contacto });
  }

  protected marcarPrincipal(fila: FilaContacto): Promise<void> {
    const persona = this.persona();
    return this.operaciones.correr(() => this.contactos.editar(persona.id, fila.contacto.id, { version: persona.version, principal: true }));
  }

  protected async eliminar(fila: FilaContacto): Promise<void> {
    const confirmacion = await this.avisos.confirmarDestructiva({
      titulo: this.mensajes.confirmarEliminar,
      texto: this.mensajes.textoEliminar(fila.tipo.toLowerCase(), fila.valor),
    });
    if (!confirmacion.confirmado) return;
    const persona = this.persona();
    await this.operaciones.correr(async () => {
      await this.contactos.eliminar(persona.id, fila.contacto.id, persona.version);
      return null;
    });
  }

  protected etiquetaAccion(accion: string, fila: FilaContacto): string {
    return this.mensajes.accionSobre(accion, fila.tipo, fila.valor);
  }

  private async abrirPanel(datos: DatosPanelContacto): Promise<void> {
    const panel = this.paneles.abrir<PanelContactoComponent, DatosPanelContacto, ResultadoPanelFicha>(PanelContactoComponent, { datos });
    const cambio = cambioDePanel(await firstValueFrom(panel.afterClosed()));
    if (cambio) this.cambio.emit(cambio);
  }

  private filaDe(contacto: ContactoPersona): FilaContacto {
    return {
      contacto,
      tipo: ETIQUETAS_TIPO_CONTACTO[contacto.tipo],
      valor: formatoContacto(contacto.tipo, contacto.valor),
      principal: contacto.principal ? this.mensajes.principal : '',
      borrable: !(contacto.tipo === 'CELULAR' && contacto.principal),
    };
  }
}
