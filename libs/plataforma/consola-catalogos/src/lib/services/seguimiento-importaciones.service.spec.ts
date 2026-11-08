import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SesionService } from '@vitrina/shared/auth';
import { TareasEnCursoService } from '@vitrina/shared/shell';
import { AvisosService } from '@vitrina/shared/ui';
import { EventosFalsos } from '../../testing/eventos-falsos';
import type { DetalleImportacion, ImportacionActiva } from '../models/importacion';
import { PERMISOS_CATALOGOS } from '../models/permisos-catalogos';
import { CorteDeStream, EventosImportacionCliente, StreamRechazado } from './eventos-importacion.cliente';
import { ImportacionesCliente } from './importaciones.cliente';
import { ESPERA_RECONEXION_MS, SeguimientoImportacionesService } from './seguimiento-importaciones.service';

const UBIGEO = 'imp-ubigeo';
const CIE10 = 'imp-cie10';
const RESUMEN = { altas: 18, cambios: 0, bajas: 1, sinCambios: 1874 };

const activa = (id: string, codigo: string, avance: number | null): ImportacionActiva => ({
  id,
  codigo,
  estado: 'EN_COLA',
  versionOficial: '2026-10',
  fechaVigencia: '2026-11-01',
  archivoNombre: 'a.csv',
  resumen: RESUMEN,
  totalErrores: 0,
  motivoFallo: null,
  creadoEn: '2026-11-08T15:00:00Z',
  terminadoEn: null,
  avance,
});
const detalle = (estado: DetalleImportacion['estado'], cambios: Partial<DetalleImportacion> = {}): DetalleImportacion => ({
  ...activa(UBIGEO, 'UBIGEO', null),
  estado,
  venceEn: '2026-11-09T15:00:00Z',
  ...cambios,
});

class SesionDePrueba {
  readonly autenticado = signal(true);
  readonly contexto = signal<{ aal: string; permisos: string[] } | null>(null);
  tiene(permiso: string): boolean {
    return this.contexto()?.permisos.includes(permiso) ?? false;
  }
}

describe('SeguimientoImportacionesService', () => {
  let sesion: SesionDePrueba;
  let eventos: EventosFalsos;
  let importaciones: { activas: ReturnType<typeof vi.fn>; detalle: ReturnType<typeof vi.fn> };
  let avisos: { toast: ReturnType<typeof vi.fn> };
  let servicio: SeguimientoImportacionesService;
  let tareas: TareasEnCursoService;

  const tarea = (id: string) => tareas.tareas().find((candidata) => candidata.id === id);
  const esperar = () => new Promise((resolver) => setTimeout(resolver));

  function crear(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: SesionService, useValue: sesion },
        { provide: EventosImportacionCliente, useValue: eventos },
        { provide: ImportacionesCliente, useValue: importaciones },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    servicio = TestBed.inject(SeguimientoImportacionesService);
    tareas = TestBed.inject(TareasEnCursoService);
    TestBed.tick();
  }

  async function conSesionAal2(permisos: string[] = [PERMISOS_CATALOGOS.importar]): Promise<void> {
    sesion.contexto.set({ aal: 'aal2', permisos });
    TestBed.tick();
    await esperar();
  }

  beforeEach(() => {
    sesion = new SesionDePrueba();
    eventos = new EventosFalsos();
    importaciones = { activas: vi.fn(async () => []), detalle: vi.fn() };
    avisos = { toast: vi.fn() };
  });

  afterEach(() => vi.useRealTimers());

  it('al quedar con sesión aal2 e importar recupera dos activas y registra dos tareas', async () => {
    importaciones.activas.mockResolvedValue([activa(UBIGEO, 'UBIGEO', 42), activa(CIE10, 'CIE10', null)]);
    crear();
    await conSesionAal2();

    expect(importaciones.activas).toHaveBeenCalledTimes(1);
    expect(eventos.aperturas).toEqual([UBIGEO, CIE10]);
    expect(tarea(UBIGEO)).toEqual({
      id: UBIGEO,
      titulo: 'Importando UBIGEO',
      avance: 42,
      detalle: 'Aplicando 42 %',
      ruta: '/consola/catalogos/UBIGEO?pestana=importaciones',
    });
    expect(tarea(CIE10)).toMatchObject({ avance: null, detalle: 'En cola' });
  });

  it('sin plat.catalogo.importar, o con aal1, no llama a activas', async () => {
    crear();
    await conSesionAal2([PERMISOS_CATALOGOS.leer]);
    sesion.contexto.set({ aal: 'aal1', permisos: [PERMISOS_CATALOGOS.importar] });
    TestBed.tick();
    await esperar();

    expect(importaciones.activas).not.toHaveBeenCalled();
  });

  it('seguir dos veces la misma importación abre un solo stream', () => {
    crear();
    servicio.seguir(UBIGEO, 'UBIGEO');
    servicio.seguir(UBIGEO, 'UBIGEO');

    expect(eventos.aperturas).toEqual([UBIGEO]);
    expect(tareas.tareas()).toHaveLength(1);
  });

  it('un avance 42 EN_PROCESO actualiza la tarea; EN_COLA la deja indeterminada', () => {
    crear();
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.emitir(UBIGEO, { tipo: 'avance', estado: 'EN_PROCESO', avance: 42 });
    expect(tarea(UBIGEO)).toMatchObject({ avance: 42, detalle: 'Aplicando 42 %' });

    eventos.emitir(UBIGEO, { tipo: 'avance', estado: 'EN_COLA', avance: 0 });
    expect(tarea(UBIGEO)).toMatchObject({ avance: null, detalle: 'En cola' });
  });

  it('un fin APLICADA quita la tarea, avisa con el resumen y emite terminadas', () => {
    crear();
    const terminadas: string[] = [];
    servicio.terminadas.subscribe((id) => terminadas.push(id));
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.emitir(UBIGEO, { tipo: 'fin', estado: 'APLICADA', resumen: RESUMEN, motivo: null });

    expect(tarea(UBIGEO)).toBeUndefined();
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'UBIGEO importado: 18 altas, 0 cambios, 1 baja');
    expect(terminadas).toEqual([UBIGEO]);
  });

  it('FALLIDA y OBSOLETA muestran su texto', () => {
    crear();
    servicio.seguir(UBIGEO, 'UBIGEO');
    servicio.seguir(CIE10, 'CIE10');
    eventos.emitir(UBIGEO, { tipo: 'fin', estado: 'FALLIDA', resumen: null, motivo: 'Se cayó la base' });
    eventos.emitir(CIE10, { tipo: 'fin', estado: 'OBSOLETA', resumen: null, motivo: null });

    expect(avisos.toast).toHaveBeenCalledWith('error', 'La importación de UBIGEO falló: Se cayó la base');
    expect(avisos.toast).toHaveBeenCalledWith('advertencia', 'La importación de CIE10 quedó obsoleta: el catálogo cambió. Vuelva a previsualizar');
    expect(tareas.tareas()).toEqual([]);
  });

  it('un corte con detalle APLICADA se trata como fin con su resumen, sin reconectar', async () => {
    crear();
    importaciones.detalle.mockResolvedValue(detalle('APLICADA'));
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.cortar(UBIGEO, new CorteDeStream());
    await esperar();

    expect(importaciones.detalle).toHaveBeenCalledTimes(1);
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'UBIGEO importado: 18 altas, 0 cambios, 1 baja');
    expect(eventos.aperturas).toEqual([UBIGEO]);
  });

  it('un corte con EN_PROCESO actualiza el avance y reconecta una vez', async () => {
    crear();
    importaciones.detalle.mockResolvedValue(detalle('EN_PROCESO', { avance: 60 }));
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.cortar(UBIGEO, new StreamRechazado(401));
    await esperar();

    expect(importaciones.detalle).toHaveBeenCalledTimes(1);
    expect(eventos.aperturas).toEqual([UBIGEO, UBIGEO]);
    expect(tarea(UBIGEO)).toMatchObject({ avance: 60 });
  });

  it('tres fallos seguidos del GET avisan y quitan la tarea; entre fallos espera 5 s', async () => {
    vi.useFakeTimers();
    crear();
    importaciones.detalle.mockRejectedValue(new Error('sin red'));
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.cortar(UBIGEO, new CorteDeStream());
    await vi.advanceTimersByTimeAsync(0);
    expect(importaciones.detalle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ESPERA_RECONEXION_MS);
    expect(importaciones.detalle).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(ESPERA_RECONEXION_MS);
    expect(importaciones.detalle).toHaveBeenCalledTimes(3);

    expect(tarea(UBIGEO)).toBeUndefined();
    expect(avisos.toast).toHaveBeenCalledWith('advertencia', 'Se perdió el seguimiento de UBIGEO. Revise el historial del catálogo');
    await vi.advanceTimersByTimeAsync(ESPERA_RECONEXION_MS * 3);
    expect(importaciones.detalle).toHaveBeenCalledTimes(3);
  });

  it('un 404 del stream quita la tarea sin toast ni GET', async () => {
    crear();
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.cortar(UBIGEO, new StreamRechazado(404));
    await esperar();

    expect(tarea(UBIGEO)).toBeUndefined();
    expect(avisos.toast).not.toHaveBeenCalled();
    expect(importaciones.detalle).not.toHaveBeenCalled();
  });

  it('cerrar sesión aborta los streams y vacía las tareas', async () => {
    importaciones.activas.mockResolvedValue([activa(UBIGEO, 'UBIGEO', null), activa(CIE10, 'CIE10', null)]);
    crear();
    await conSesionAal2();

    sesion.autenticado.set(false);
    sesion.contexto.set(null);
    TestBed.tick();

    expect(eventos.cerrados.sort()).toEqual([CIE10, UBIGEO]);
    expect(eventos.abiertos.size).toBe(0);
    expect(tareas.tareas()).toEqual([]);
  });

  it('no deja temporizadores pendientes: no hay polling periódico', async () => {
    vi.useFakeTimers();
    importaciones.detalle.mockResolvedValue(detalle('EN_COLA'));
    crear();
    servicio.seguir(UBIGEO, 'UBIGEO');
    eventos.emitir(UBIGEO, { tipo: 'avance', estado: 'EN_PROCESO', avance: 10 });
    eventos.cortar(UBIGEO, new CorteDeStream());
    await vi.advanceTimersByTimeAsync(0);

    expect(eventos.aperturas).toEqual([UBIGEO, UBIGEO]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(ESPERA_RECONEXION_MS * 10);
    expect(importaciones.detalle).toHaveBeenCalledTimes(1);
  });
});
