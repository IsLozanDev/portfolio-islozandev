import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { SesionService } from '@vitrina/shared/auth';
import { of } from 'rxjs';
import { ArchivosCliente } from '../../services/archivos.cliente';
import { CategoriasService } from '../../services/categorias.service';
import { EventosAnalisisCliente } from '../../services/eventos-analisis.cliente';
import { SubidaStorageCliente } from '../../services/subida-storage.cliente';
import { ArchivoCargaComponent } from '../archivo-carga/archivo-carga.component';
import { PanelSubirVersionComponent, type DatosPanelSubirVersion } from './panel-subir-version.component';

const DATOS: DatosPanelSubirVersion = { archivoId: 'arc-1', categoria: 'DOCUMENTO', nombre: 'contrato.pdf', versionVigente: 3 };

describe('PanelSubirVersionComponent', () => {
  let fixture: ComponentFixture<PanelSubirVersionComponent>;
  let cerrar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cerrar = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: DATOS },
        { provide: MatDialogRef, useValue: { close: cerrar, keydownEvents: () => of() } },
        { provide: ArchivosCliente, useValue: {} },
        { provide: CategoriasService, useValue: { buscar: vi.fn(async () => undefined) } },
        { provide: SesionService, useValue: { tiene: () => true } },
        { provide: EventosAnalisisCliente, useValue: {} },
        { provide: SubidaStorageCliente, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(PanelSubirVersionComponent);
    fixture.detectChanges();
  });

  const carga = () => fixture.debugElement.query(By.directive(ArchivoCargaComponent)).componentInstance as ArchivoCargaComponent;

  it('monta la carga en modo versión del archivo, con su categoría y la vigente en el subtítulo', () => {
    expect(fixture.nativeElement.querySelector('[data-prueba="subtitulo"]')?.textContent).toBe('contrato.pdf · vigente: versión 3');
    expect(carga().modo()).toBe('version');
    expect(carga().archivoId()).toBe('arc-1');
    expect(carga().categoria()).toBe('DOCUMENTO');
  });

  it('cierra con la versión disponible; un rechazo deja el panel abierto', () => {
    carga().rechazado.emit({ archivoId: 'arc-1', numero: 4, resultado: 'RECHAZADO', mensaje: 'El archivo es idéntico a la versión vigente' });
    expect(cerrar).not.toHaveBeenCalled();

    carga().disponible.emit({ archivoId: 'arc-1', numero: 4 });
    expect(cerrar).toHaveBeenCalledWith({ archivoId: 'arc-1', numero: 4 });
  });

  it('«Cerrar» cierra sin resultado', () => {
    (fixture.nativeElement.querySelector('[data-accion="cerrar-panel"]') as HTMLButtonElement).click();
    expect(cerrar).toHaveBeenCalledWith();
  });
});
