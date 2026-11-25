import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DuplicadosCliente, ErrorPersonas, type ComparacionPar, type PersonaDetalle } from '@vitrina/plataforma/personas-ui';
import { SesionService } from '@vitrina/shared/auth';
import { AccionSensibleService } from '@vitrina/shared/shell';
import { AvisosService } from '@vitrina/shared/ui';
import { vi } from 'vitest';
import { DobleSesion } from '../../../testing/doble-sesion';
import { ESTADO_DESCARTE } from '../../models/descarte-hecho';
import { DuplicadosComparacionPage } from './duplicados-comparacion.page';

const UBIGEO_CAYMA = { ubigeo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA', referencia: null };
/** TR-CA-107 adaptado: la ficha A es la del pasaporte (id menor) y la B la del DNI. */
const JUANA_PASAPORTE: PersonaDetalle = {
  id: 'per-a',
  tipoPersona: 'NATURAL',
  tipoDocumento: 'PASAPORTE',
  numeroDocumento: '118204573',
  nombres: 'Juana',
  apellidoPaterno: 'Quispe',
  apellidoMaterno: null,
  razonSocial: null,
  activo: true,
  version: 1,
  roles: [{ productoCodigo: 'GYM', rol: 'SOCIO', desde: '2026-11-18', hasta: null }],
  contactos: [
    { id: 'a-cel', tipo: 'CELULAR', valor: '987654321', principal: true },
    { id: 'a-cel2', tipo: 'CELULAR', valor: '958123447', principal: false },
  ],
  direcciones: [{ id: 'a-d1', direccion: 'av ejercito 710', principal: true, ...UBIGEO_CAYMA }],
  resueltaDesde: null,
  alias: [],
};
const JUANA_DNI: PersonaDetalle = {
  ...JUANA_PASAPORTE,
  id: 'per-b',
  tipoDocumento: 'DNI',
  numeroDocumento: '45781236',
  apellidoMaterno: 'Mamani',
  version: 3,
  roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE', desde: '2026-03-02', hasta: null }],
  contactos: [
    { id: 'b-cel', tipo: 'CELULAR', valor: '987654321', principal: true },
    { id: 'b-cor', tipo: 'CORREO', valor: 'juana.quispe@correo.pe', principal: true },
  ],
  direcciones: [{ id: 'b-d1', direccion: 'Av. Ejército 710', principal: true, ...UBIGEO_CAYMA }],
};
const COMPARACION: ComparacionPar = {
  personaA: JUANA_PASAPORTE,
  personaB: JUANA_DNI,
  puntaje: 60,
  motivos: ['CELULAR_Y_NOMBRE_PARECIDO'],
  descartado: false,
  bloqueo: null,
};
const RUTA = '/admin/personas/duplicados/per-a/per-b';

@Component({ selector: 'vit-destino-comparacion', template: '' })
class Destino {}

describe('DuplicadosComparacionPage', () => {
  let harness: RouterTestingHarness;
  let sesion: DobleSesion;
  let duplicados: {
    comparar: ReturnType<typeof vi.fn>;
    descartar: ReturnType<typeof vi.fn>;
    quitarDescarte: ReturnType<typeof vi.fn>;
    fusionar: ReturnType<typeof vi.fn>;
  };
  let exigirMfa: ReturnType<typeof vi.fn>;
  let avisos: { confirmar: ReturnType<typeof vi.fn>; confirmarDestructiva: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; toast: ReturnType<typeof vi.fn> };

  const elemento = () => harness.routeNativeElement as HTMLElement;
  const router = () => TestBed.inject(Router);
  const buscar = <T extends HTMLElement = HTMLElement>(selector: string) => elemento().querySelector(selector) as T | null;
  const radio = (selector: string) => buscar<HTMLInputElement>(`${selector} input[type="radio"]`);
  const resultado = () => buscar('[data-resultado]')?.textContent?.trim();

  async function estable(): Promise<void> {
    await new Promise((resolver) => setTimeout(resolver));
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  async function abrir(comparaciones: (ComparacionPar | Error)[] = [COMPARACION]): Promise<void> {
    const respuestas = [...comparaciones];
    duplicados = {
      comparar: vi.fn(async () => {
        const respuesta = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      }),
      descartar: vi.fn(async () => undefined),
      quitarDescarte: vi.fn(async () => undefined),
      fusionar: vi.fn(async () => ({ ...JUANA_DNI, version: 4, alias: ['per-a'] })),
    };
    exigirMfa = vi.fn(async () => true);
    avisos = {
      confirmar: vi.fn(async () => true),
      confirmarDestructiva: vi.fn(async () => ({ confirmado: true, motivo: 'Misma clienta registrada con pasaporte' })),
      error: vi.fn(async () => undefined),
      toast: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            children: [
              { path: 'personas/duplicados', component: Destino },
              { path: 'personas/duplicados/:a/:b', component: DuplicadosComparacionPage },
              { path: 'personas/:personaId', component: Destino },
            ],
          },
          { path: '**', component: Destino },
        ]),
        { provide: SesionService, useValue: sesion },
        { provide: DuplicadosCliente, useValue: duplicados },
        { provide: AccionSensibleService, useValue: { exigirMfa } },
        { provide: AvisosService, useValue: avisos },
      ],
    });
    harness = await RouterTestingHarness.create(RUTA);
    await estable();
  }

  beforeEach(() => {
    sesion = new DobleSesion();
    sesion.contexto.set({ permisos: ['plat.persona.leer', 'plat.persona.fusionar'], mfaVigente: true });
  });

  it('TR-CA-107: preselecciona la ficha del DNI y muestra una vez el celular de las dos', async () => {
    await abrir();

    expect(duplicados.comparar).toHaveBeenCalledWith('per-a', 'per-b');
    expect(radio('[data-conservar="Ficha B"]')?.checked).toBe(true);
    expect(buscar('[data-ficha="Ficha B"]')?.textContent).toContain('Queda');
    expect(buscar('[data-ficha="Ficha A"]')?.textContent).toContain('Pasa a ser alias');
    expect(resultado()).toBe('Quispe Mamani, Juana');
    expect(buscar('[data-documento-queda]')?.textContent).toBe('DNI 45781236');
    const celulares = buscar('[data-grupo="CELULAR"]');
    expect(celulares?.querySelectorAll('[data-candidato]')).toHaveLength(2);
    expect(celulares?.textContent).toContain('En las dos');
    expect(radio('[data-candidato="b-cel"]')?.checked).toBe(true);
    expect(buscar('[data-fila="dato-nombres"]')?.textContent).toContain('Igual');
    expect(elemento().textContent).toContain('Puntaje 60');
    expect(elemento().textContent).toContain('Mismo celular, nombre parecido');
    expect(buscar('[data-accion="volver"]')?.getAttribute('href')).toBe('/admin/personas/duplicados');
  });

  it('TR-CA-107: elegir campos y confirmar con motivo fusiona y abre la ficha conservada', async () => {
    await abrir();
    radio('[data-fila="dato-apellidoMaterno"] [data-opcion="Ficha A"]')?.click();
    await estable();
    expect(resultado()).toBe('Quispe, Juana');
    radio('[data-fila="dato-apellidoMaterno"] [data-opcion="Ficha B"]')?.click();
    radio('[data-candidato="a-cel2"]')?.click();
    await estable();

    buscar('[data-accion="fusionar"]')?.click();
    await estable();

    expect(exigirMfa).toHaveBeenCalled();
    expect(avisos.confirmarDestructiva).toHaveBeenCalledWith({
      titulo: '¿Fusionar las fichas?',
      texto: 'Quedará solo la ficha de Quispe Mamani, Juana (DNI 45781236). La de Quispe, Juana (Pasaporte 118204573) pasará a ser un alias y no se puede deshacer.',
      textoConfirmar: 'Fusionar',
      pedirMotivo: true,
      longitudMinimaMotivo: 5,
      longitudMaximaMotivo: 300,
    });
    expect(duplicados.fusionar).toHaveBeenCalledWith({
      conservadaId: 'per-b',
      absorbidaId: 'per-a',
      versionConservada: 3,
      versionAbsorbida: 1,
      datosBasicos: { nombres: 'CONSERVADA', apellidoPaterno: 'CONSERVADA', apellidoMaterno: 'CONSERVADA' },
      principales: { CELULAR: 'a-cel2', CORREO: 'b-cor', DIRECCION: 'b-d1' },
      motivo: 'Misma clienta registrada con pasaporte',
    });
    expect(avisos.toast).toHaveBeenCalledWith('exito', 'Fichas fusionadas');
    expect(router().url).toBe('/admin/personas/per-b');
  });

  it('cambiar la ficha que queda vuelve la elección a la inicial de esa ficha', async () => {
    await abrir();
    radio('[data-candidato="a-cel2"]')?.click();
    await estable();
    radio('[data-conservar="Ficha A"]')?.click();
    await estable();

    expect(resultado()).toBe('Quispe, Juana');
    expect(buscar('[data-documento-queda]')?.textContent).toBe('Pasaporte 118204573');
    expect(radio('[data-candidato="a-cel"]')?.checked).toBe(true);
    expect(radio('[data-candidato="a-cel2"]')?.checked).toBe(false);
  });

  it('cancelar la confirmación no fusiona', async () => {
    await abrir();
    avisos.confirmarDestructiva.mockResolvedValueOnce({ confirmado: false });
    buscar('[data-accion="fusionar"]')?.click();
    await estable();
    expect(duplicados.fusionar).not.toHaveBeenCalled();
  });

  it('TR-CA-108: con documentos distintos muestra la franja, la elección en solo lectura y sin «Fusionar» activo', async () => {
    await abrir([{ ...COMPARACION, personaA: { ...JUANA_DNI, id: 'per-a', numeroDocumento: '45781237' }, bloqueo: 'DOCUMENTOS_DISTINTOS' }]);

    expect(buscar('[data-franja="bloqueo"]')?.textContent).toContain('Las personas tienen documentos distintos');
    expect(elemento().querySelector('input[type="radio"]')).toBeNull();
    expect(buscar<HTMLButtonElement>('[data-accion="fusionar"]')?.disabled).toBe(true);
  });

  it('VERSION_OBSOLETA al fusionar avisa, relee la comparación y vuelve a la elección inicial', async () => {
    await abrir([COMPARACION, { ...COMPARACION, personaA: { ...JUANA_PASAPORTE, version: 2 } }]);
    duplicados.fusionar.mockRejectedValueOnce(new ErrorPersonas('VERSION_OBSOLETA', 'x', 409));
    radio('[data-candidato="a-cel2"]')?.click();
    await estable();
    buscar('[data-accion="fusionar"]')?.click();
    await estable();

    expect(avisos.error).toHaveBeenCalledWith('No se pudo completar', 'Una de las fichas cambió; se recargó la comparación');
    expect(duplicados.comparar).toHaveBeenCalledTimes(2);
    expect(radio('[data-candidato="b-cel"]')?.checked).toBe(true);
    expect(router().url).toBe(RUTA);
  });

  it('un par descartado muestra el chip y «Volver a proponer» quita el descarte y relee', async () => {
    await abrir([{ ...COMPARACION, descartado: true }, COMPARACION]);
    expect(buscar('[data-estado="descartado"]')?.textContent).toContain('Descartado');

    buscar('[data-accion="volver-a-proponer"]')?.click();
    await estable();
    expect(duplicados.quitarDescarte).toHaveBeenCalledWith('per-a', 'per-b');
    expect(buscar('[data-estado="descartado"]')).toBeNull();
    expect(buscar('[data-accion="descartar"]')).not.toBeNull();
  });

  it('«No son la misma persona» descarta y vuelve a la lista con el par para deshacer', async () => {
    await abrir();
    buscar('[data-accion="descartar"]')?.click();
    await estable();

    expect(duplicados.descartar).toHaveBeenCalledWith('per-a', 'per-b');
    expect(router().url).toBe('/admin/personas/duplicados');
    expect(router().lastSuccessfulNavigation()?.extras.state?.[ESTADO_DESCARTE]).toEqual({
      idA: 'per-a',
      idB: 'per-b',
      texto: 'Se descartó el par Quispe, Juana — Quispe Mamani, Juana',
    });
  });

  it('sin MFA vigente muestra la franja con la elección y «Fusionar» deshabilitados; «Verificar ahora» pide el MFA', async () => {
    sesion.contexto.set({ permisos: ['plat.persona.leer', 'plat.persona.fusionar'], mfaVigente: false });
    await abrir();

    expect(buscar('[data-franja="mfa"]')).not.toBeNull();
    expect(radio('[data-candidato="a-cel2"]')?.disabled).toBe(true);
    expect(buscar<HTMLButtonElement>('[data-accion="fusionar"]')?.disabled).toBe(true);
    buscar('[data-accion="verificar"]')?.click();
    await estable();
    expect(exigirMfa).toHaveBeenCalled();
  });

  it('sin plat.persona.fusionar es solo lectura: sin radios, sin descartar y sin pie', async () => {
    sesion.contexto.set({ permisos: ['plat.persona.leer'], mfaVigente: true });
    await abrir();

    expect(buscar('[data-nota="solo-lectura"]')).not.toBeNull();
    expect(elemento().querySelector('input[type="radio"]')).toBeNull();
    expect(buscar('[data-accion="descartar"]')).toBeNull();
    expect(buscar('[data-accion="fusionar"]')).toBeNull();
    expect(buscar('[data-grupo="CELULAR"]')?.textContent).toContain('987 654 321');
  });

  it('un par de otro tenant muestra que no existe', async () => {
    await abrir([new ErrorPersonas('NO_ENCONTRADA', 'x', 404)]);
    expect(elemento().textContent).toContain('El par no existe o no es de su organización');
  });
});
