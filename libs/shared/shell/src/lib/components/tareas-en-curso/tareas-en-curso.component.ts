import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { MENSAJES_SHELL, mensajeAvancePorcentaje, mensajeTareasEnCurso } from '../../models/mensajes-shell';
import { TareasEnCursoService } from '../../services/tareas-en-curso.service';
import { avancePromedio } from '../../utils/avance-promedio';

const DIAMETRO_SPINNER_PX = 28;
const GROSOR_SPINNER_PX = 3;

/** Indicador de la barra con las tareas largas que otras libs registran (spec 19d). Sin tareas no se pinta. */
@Component({
  selector: 'vit-tareas-en-curso',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, MatProgressSpinnerModule],
  templateUrl: './tareas-en-curso.component.html',
  styleUrl: './tareas-en-curso.component.css',
})
export class TareasEnCursoComponent {
  private readonly router = inject(Router);

  protected readonly mensajes = MENSAJES_SHELL;
  protected readonly diametroSpinner = DIAMETRO_SPINNER_PX;
  protected readonly grosorSpinner = GROSOR_SPINNER_PX;
  protected readonly tareas = inject(TareasEnCursoService).tareas;
  protected readonly cantidad = computed(() => this.tareas().length);
  protected readonly promedio = computed(() => avancePromedio(this.tareas()));
  protected readonly etiqueta = computed(() => mensajeTareasEnCurso(this.cantidad()));
  protected readonly textoAvance = computed(() => {
    const promedio = this.promedio();
    return promedio === null ? MENSAJES_SHELL.enCola : mensajeAvancePorcentaje(promedio);
  });

  protected abrir(ruta: string): void {
    void this.router.navigateByUrl(ruta);
  }
}
