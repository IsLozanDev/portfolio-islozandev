import { Component, computed, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, type FormControl } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MENSAJES_FICHA } from '../../models/mensajes-ficha';
import type { ValorUbigeo } from '../../models/ubigeo';
import { UbigeosService } from '../../services/ubigeos.service';
import { filtrarUbigeos } from '../../utils/filtrar-ubigeos';
import { formatoUbigeo } from '../../utils/formato-ubigeo';

/**
 * Campo de distrito con sugerencias del catálogo `UBIGEO` (TR-CA-105): se escribe distrito, provincia o
 * departamento y se elige «AREQUIPA / AREQUIPA / CAYMA». El catálogo se carga una vez por sesión.
 */
@Component({
  selector: 'vit-ubigeo-autocompletar',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatFormFieldModule, MatInputModule],
  templateUrl: './ubigeo-autocompletar.component.html',
})
export class UbigeoAutocompletarComponent implements OnInit {
  private readonly ubigeos = inject(UbigeosService);
  private readonly destruccion = inject(DestroyRef);

  readonly control = input.required<FormControl<ValorUbigeo>>();
  /** «Distrito» en la ficha de persona; empresa y sucursal piden «Ubigeo (departamento / provincia / distrito)». */
  readonly etiqueta = input<string>(MENSAJES_FICHA.direcciones.distrito);

  protected readonly mensajes = MENSAJES_FICHA.direcciones;
  private readonly escrito = signal('');
  private readonly elegido = signal(false);
  protected readonly opciones = computed(() => filtrarUbigeos(this.ubigeos.ubigeos(), this.escrito()));
  protected readonly sinOpciones = computed(() => this.ubigeos.listos() && this.escrito().trim() !== '' && this.opciones().length === 0);
  protected readonly ayuda = computed(() => (this.elegido() ? this.mensajes.ubigeoElegido : this.mensajes.ayudaUbigeo));
  protected readonly errorCarga = computed(() => this.ubigeos.estado() === 'ERROR');
  protected readonly mostrar = (valor: ValorUbigeo): string => (valor && typeof valor !== 'string' ? formatoUbigeo(valor) : (valor ?? ''));
  protected readonly formato = formatoUbigeo;

  ngOnInit(): void {
    this.actualizar(this.control().value);
    this.control()
      .valueChanges.pipe(takeUntilDestroyed(this.destruccion))
      .subscribe((valor) => this.actualizar(valor));
    void this.ubigeos.cargar().catch(() => undefined);
  }

  private actualizar(valor: ValorUbigeo): void {
    this.elegido.set(valor !== null && typeof valor !== 'string');
    this.escrito.set(typeof valor === 'string' ? valor : '');
  }
}
