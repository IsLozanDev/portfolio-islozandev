import { aContextoUsuario, type MiContextoRespuesta } from './mi-contexto';

const RESPUESTA: MiContextoRespuesta = {
  usuario_id: 'u-1',
  tenant_id: 't-1',
  tipo_usuario: 'EXTERNO',
  aal: 'aal2',
  mfa_vigente: true,
  mfa_en: '2026-10-26T14:00:00.000Z',
  sucursales: [{ id: 's-1', empresa_id: 'e-1', codigo: 'MIR', nombre: 'Miraflores' }],
  sucursal_actual: 's-1',
  requiere_seleccion: false,
  sin_accesos: false,
  permisos: ['rest.caja.abrir'],
  menu: [{ codigo: 'rest.caja', padre: null, nombre: 'Caja', ruta: '/caja', icono: 'point_of_sale', orden: 1 }],
};

describe('aContextoUsuario', () => {
  it('pasa la respuesta de la API a camelCase', () => {
    const contexto = aContextoUsuario(RESPUESTA);

    expect(contexto).toEqual({
      usuarioId: 'u-1',
      tenantId: 't-1',
      tipoUsuario: 'EXTERNO',
      aal: 'aal2',
      mfaVigente: true,
      mfaEn: new Date('2026-10-26T14:00:00.000Z'),
      sucursales: [{ id: 's-1', empresaId: 'e-1', codigo: 'MIR', nombre: 'Miraflores' }],
      sucursalActual: 's-1',
      requiereSeleccion: false,
      sinAccesos: false,
      permisos: ['rest.caja.abrir'],
      menu: RESPUESTA.menu,
    });
  });

  it('sin MFA deja mfaEn en null', () => {
    expect(aContextoUsuario({ ...RESPUESTA, mfa_en: null }).mfaEn).toBeNull();
  });
});
