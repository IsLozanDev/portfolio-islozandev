import { ValidationError } from '@vitrina/plataforma/kernel';
import { Asignacion, type ContextoOtorgamiento, type DatosAsignacion } from '../src/domain/asignacion.js';
import { AlcanceIncoherenteError, AlcanceInsuficienteError, RolOPerfilError, VigenciaInvalidaError } from '../src/domain/errores.js';

const ID = '0193f3a0-0000-7000-8000-000000000401';
const TENANT = '0193f3a0-0000-7000-8000-000000000001';
const MEMBRESIA_LUIS = '0193f3a0-0000-7000-8000-000000000301';
const CAJERO = '0193f3a0-0000-7000-8000-000000000501';
const PERFIL = '0193f3a0-0000-7000-8000-000000000601';
const CAJA_02 = '0193f3a0-0000-7000-8000-000000000201';
const OTORGANTE = '0193f3a0-0000-7000-8000-000000000901';

const datos = (cambios: Partial<DatosAsignacion> = {}): DatosAsignacion => ({
  membresiaId: MEMBRESIA_LUIS,
  rolId: CAJERO,
  perfilId: null,
  alcance: 'UNIDAD',
  empresaId: null,
  sucursalId: null,
  unidadId: CAJA_02,
  vigenteDesde: '2026-10-15',
  vigenteHasta: '2026-10-31',
  ...cambios,
});
const contexto = (cambios: Partial<ContextoOtorgamiento> = {}): ContextoOtorgamiento => ({
  hoy: '2026-10-21',
  otorgadoPor: OTORGANTE,
  permisos: [{ codigo: 'rest.caja.cerrar', alcanceMinimo: 'UNIDAD' }],
  ...cambios,
});

describe('Asignacion.otorgar (TR-RF-013, TR-RN-008)', () => {
  it('TR-CA-036: Cajero en CAJA-02 del 15/10 al 31/10', () => {
    const a = Asignacion.otorgar(ID, TENANT, datos(), contexto());

    expect(a.ubicacion).toEqual({ alcance: 'UNIDAD', empresaId: null, sucursalId: null, unidadId: CAJA_02 });
    expect(a.vigenteEn('2026-10-15')).toBe(true);
    expect(a.vigenteEn('2026-10-31')).toBe(true);
    expect(a.vigenteEn('2026-10-14')).toBe(false);
    expect(a.vigenteEn('2026-11-01')).toBe(false);
    expect(a.version).toBe(1);
    expect(a.pullEvents()).toEqual([
      expect.objectContaining({
        eventType: 'asignacion.otorgada',
        aggregateType: 'asignacion',
        aggregateId: ID,
        aggregateVersion: 1,
        schemaVersion: 1,
        payload: {
          membresia_id: MEMBRESIA_LUIS,
          rol_id: CAJERO,
          perfil_id: null,
          alcance: 'UNIDAD',
          empresa_id: null,
          sucursal_id: null,
          unidad_id: CAJA_02,
          vigente_desde: '2026-10-15',
          vigente_hasta: '2026-10-31',
          otorgado_por: OTORGANTE,
        },
      }),
    ]);
  });

  it('vigente_desde por defecto es hoy y vigente_hasta es opcional', () => {
    const a = Asignacion.otorgar(ID, TENANT, datos({ vigenteDesde: undefined, vigenteHasta: null }), contexto());
    expect(a.vigenteDesde).toBe('2026-10-21');
    expect(a.vigenteHasta).toBeNull();
    expect(a.vigenteEn('2099-01-01')).toBe(true);
  });

  it('TR-CA-037: rol y perfil a la vez', () => {
    expect(() => Asignacion.otorgar(ID, TENANT, datos({ perfilId: PERFIL }), contexto())).toThrow(
      new RolOPerfilError(),
    );
    expect(() => Asignacion.otorgar(ID, TENANT, datos({ perfilId: PERFIL }), contexto())).toThrow(
      'Seleccione un rol o un perfil, no ambos',
    );
  });

  it('ni rol ni perfil', () => {
    expect(() => Asignacion.otorgar(ID, TENANT, datos({ rolId: null }), contexto())).toThrow(RolOPerfilError);
  });

  it('acepta un perfil sin rol', () => {
    expect(Asignacion.otorgar(ID, TENANT, datos({ rolId: null, perfilId: PERFIL }), contexto()).perfilId).toBe(PERFIL);
  });

  it('TR-CA-038: vigente_hasta anterior a vigente_desde', () => {
    const invertida = () => Asignacion.otorgar(ID, TENANT, datos({ vigenteDesde: '2026-10-20', vigenteHasta: '2026-10-19' }), contexto());
    expect(invertida).toThrow(VigenciaInvalidaError);
    expect(invertida).toThrow('La vigencia hasta no puede ser anterior a la vigencia desde');
  });

  it('desde y hasta el mismo día es válido', () => {
    expect(() => Asignacion.otorgar(ID, TENANT, datos({ vigenteDesde: '2026-10-21', vigenteHasta: '2026-10-21' }), contexto())).not.toThrow();
  });

  it.each(['2026-02-30', '21/10/2026', '2026-1-5'])('rechaza la fecha %s', (fecha) => {
    expect(() => Asignacion.otorgar(ID, TENANT, datos({ vigenteDesde: fecha }), contexto())).toThrow(ValidationError);
  });

  it.each([
    ['TENANT con unidad', datos({ alcance: 'TENANT' })],
    ['EMPRESA sin empresa', datos({ alcance: 'EMPRESA' })],
    ['SUCURSAL con unidad', datos({ alcance: 'SUCURSAL', sucursalId: 's' })],
    ['UNIDAD sin unidad', datos({ unidadId: null })],
    ['UNIDAD con empresa', datos({ empresaId: 'e' })],
  ])('alcance incoherente: %s', (_caso, d) => {
    expect(() => Asignacion.otorgar(ID, TENANT, d, contexto({ permisos: [] }))).toThrow(AlcanceIncoherenteError);
  });

  it('alcance desconocido', () => {
    expect(() => Asignacion.otorgar(ID, TENANT, datos({ alcance: 'PAIS' as never }), contexto())).toThrow('Alcance desconocido');
  });

  it('el alcance no puede ser menor que el alcance_minimo de los permisos', () => {
    const permisos = [
      { codigo: 'rest.caja.cerrar', alcanceMinimo: 'UNIDAD' as const },
      { codigo: 'rest.reporte.ver', alcanceMinimo: 'SUCURSAL' as const },
      { codigo: 'rest.carta.editar', alcanceMinimo: 'EMPRESA' as const },
    ];
    const otorgar = () => Asignacion.otorgar(ID, TENANT, datos(), contexto({ permisos }));
    expect(otorgar).toThrow(AlcanceInsuficienteError);
    expect(otorgar).toThrow('rest.carta.editar, rest.reporte.ver');
  });

  it('con alcance suficiente pasa', () => {
    const permisos = [{ codigo: 'rest.reporte.ver', alcanceMinimo: 'SUCURSAL' as const }];
    const d = datos({ alcance: 'SUCURSAL', unidadId: null, sucursalId: 's' });
    expect(Asignacion.otorgar(ID, TENANT, d, contexto({ permisos })).alcance).toBe('SUCURSAL');
  });
});

describe('Asignacion.reconstituir', () => {
  it('no emite eventos y conserva la versión', () => {
    const a = Asignacion.reconstituir(ID, 3, {
      tenantId: TENANT,
      membresiaId: MEMBRESIA_LUIS,
      rolId: CAJERO,
      perfilId: null,
      alcance: 'TENANT',
      empresaId: null,
      sucursalId: null,
      unidadId: null,
      vigenteDesde: '2026-01-01',
      vigenteHasta: null,
      otorgadoPor: null,
    });
    expect(a.version).toBe(3);
    expect(a.tenantId).toBe(TENANT);
    expect(a.membresiaId).toBe(MEMBRESIA_LUIS);
    expect(a.rolId).toBe(CAJERO);
    expect(a.otorgadoPor).toBeNull();
    expect(a.pullEvents()).toEqual([]);
  });
});
