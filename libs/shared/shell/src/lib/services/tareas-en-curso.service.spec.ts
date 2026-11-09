import { TestBed } from '@angular/core/testing';
import type { TareaEnCurso } from '../models/tarea-en-curso';
import { TareasEnCursoService } from './tareas-en-curso.service';

const ubigeo: TareaEnCurso = { id: 'imp-1', titulo: 'Importando UBIGEO', avance: null, detalle: 'En cola', ruta: '/consola/catalogos/UBIGEO' };
const cie10: TareaEnCurso = { id: 'imp-2', titulo: 'Importando CIE10', avance: 10, detalle: 'Aplicando 10 %', ruta: null };

describe('TareasEnCursoService', () => {
  let servicio: TareasEnCursoService;
  beforeEach(() => {
    servicio = TestBed.inject(TareasEnCursoService);
  });

  it('registrar dos veces el mismo id deja una sola tarea, con los datos nuevos y en su lugar', () => {
    servicio.registrar(ubigeo);
    servicio.registrar(cie10);
    servicio.registrar({ ...ubigeo, detalle: 'Aplicando 5 %', avance: 5 });

    expect(servicio.tareas()).toEqual([{ ...ubigeo, detalle: 'Aplicando 5 %', avance: 5 }, cie10]);
  });

  it('actualizar cambia solo los campos dados e ignora ids desconocidos', () => {
    servicio.registrar(ubigeo);
    servicio.actualizar('imp-1', { avance: 42, detalle: 'Aplicando 42 %' });
    servicio.actualizar('otro', { avance: 99 });

    expect(servicio.tareas()).toEqual([{ ...ubigeo, avance: 42, detalle: 'Aplicando 42 %' }]);
  });

  it('quitar saca una tarea y vaciar las saca todas', () => {
    servicio.registrar(ubigeo);
    servicio.registrar(cie10);
    servicio.quitar('imp-1');
    expect(servicio.tareas()).toEqual([cie10]);

    servicio.vaciar();
    expect(servicio.tareas()).toEqual([]);
  });
});
