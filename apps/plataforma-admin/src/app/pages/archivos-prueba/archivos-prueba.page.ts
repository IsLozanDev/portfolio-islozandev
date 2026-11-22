import { Component, inject, signal, type OnInit } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router } from '@angular/router';
import { ArchivoCargaComponent, ArchivoVersionesComponent, CategoriasService, type ArchivoDisponible } from '@vitrina/plataforma/archivos-ui';
import { ChipEstadoComponent } from '@vitrina/shared/ui';

const ENTIDAD_TIPO = 'PRUEBA_DEV';
const PARAMETRO_ENTIDAD = 'entidad';
const CATEGORIA_INICIAL = 'DOCUMENTO';

/** Solo fuera de producción (`/dev/archivos`, spec 36): monta `vit-archivo-carga` y `vit-archivo-versiones` contra la API real. */
@Component({
  selector: 'vit-archivos-prueba',
  imports: [MatFormFieldModule, MatIconModule, MatSelectModule, ArchivoCargaComponent, ArchivoVersionesComponent, ChipEstadoComponent],
  templateUrl: './archivos-prueba.page.html',
  styleUrl: './archivos-prueba.page.css',
})
export class ArchivosPruebaPage implements OnInit {
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly categoriasService = inject(CategoriasService);

  protected readonly entidadTipo = ENTIDAD_TIPO;
  protected readonly categorias = this.categoriasService.categorias;
  protected readonly categoria = signal(CATEGORIA_INICIAL);
  protected readonly entidadId = signal('');
  protected readonly archivoId = signal<string | null>(null);

  ngOnInit(): void {
    void this.categoriasService.cargar();
    const enUrl = this.ruta.snapshot.queryParamMap.get(PARAMETRO_ENTIDAD);
    if (enUrl) {
      this.entidadId.set(enUrl);
      return;
    }
    const nueva = crypto.randomUUID();
    this.entidadId.set(nueva);
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: { [PARAMETRO_ENTIDAD]: nueva }, replaceUrl: true });
  }

  protected alDisponible(disponible: ArchivoDisponible): void {
    this.archivoId.set(disponible.archivoId);
  }
}
