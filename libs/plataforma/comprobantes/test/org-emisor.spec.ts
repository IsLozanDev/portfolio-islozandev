import { NotFoundError } from '@vitrina/plataforma/kernel';
import type { EmpresaListada, SucursalListada } from '@vitrina/plataforma/org';
import { emisorDePrueba, exigirDatosEmisor } from '../src/domain/emisor-documento.js';
import { DatosEmisorIncompletosError, EmpresaNoEncontradaError, SucursalNoEncontradaError } from '../src/domain/errores.js';
import { EmpresaEmisoraOrg, LIMITE_EMPRESAS_EMISORAS } from '../src/infrastructure/org/empresa-emisora.org.js';
import { SucursalesEmisorasOrg } from '../src/infrastructure/org/sucursales-emisoras.org.js';

const EMPRESA: EmpresaListada = {
  id: 'empresa-1',
  ruc: '20601234561',
  razonSocial: 'RESTAURANTE EL SAZON SAC',
  nombreComercial: 'EL SAZON',
  direccionFiscal: 'AV. LARCO 123, MIRAFLORES',
  ubigeo: '150122',
  telefono: null,
  correo: null,
  sitioWeb: null,
  logoArchivoId: null,
  activo: true,
  version: 3,
};

const SUCURSAL: SucursalListada = {
  id: 'sucursal-1',
  empresaId: EMPRESA.id,
  codigo: 'MIR',
  nombre: 'Miraflores',
  codigoEstablecimientoSunat: '0001',
  direccion: null,
  ubigeo: null,
  telefono: null,
  zonaHoraria: 'America/Lima',
  esPrincipal: true,
  activo: true,
  version: 1,
};

function consultaQueDevuelve<T>(valor: T) {
  return { ejecutar: () => Promise.resolve(valor) };
}

function consultaQueNoEncuentra() {
  return { ejecutar: () => Promise.reject(new NotFoundError('No existe')) };
}

const listadoVacio = consultaQueDevuelve({ items: [], total: 0 });

describe('EmpresaEmisoraOrg', () => {
  it('trae razón social, nombre comercial, domicilio fiscal y ubigeo de ORG', async () => {
    const empresa = await new EmpresaEmisoraOrg(consultaQueDevuelve(EMPRESA), listadoVacio).obtener(EMPRESA.id);
    expect(empresa).toEqual({
      id: EMPRESA.id,
      ruc: EMPRESA.ruc,
      activa: true,
      razonSocial: 'RESTAURANTE EL SAZON SAC',
      nombreComercial: 'EL SAZON',
      domicilioFiscal: 'AV. LARCO 123, MIRAFLORES',
      ubigeo: '150122',
    });
    expect(exigirDatosEmisor(empresa, '0001')).toMatchObject({ domicilioFiscal: 'AV. LARCO 123, MIRAFLORES', codigoEstablecimiento: '0001' });
  });

  it('empresa sin domicilio ni ubigeo: null, que el documento rechaza y la prueba del 50 tolera', async () => {
    const empresa = await new EmpresaEmisoraOrg(consultaQueDevuelve({ ...EMPRESA, direccionFiscal: null, ubigeo: null }), listadoVacio).obtener(EMPRESA.id);
    expect(empresa).toMatchObject({ domicilioFiscal: null, ubigeo: null });
    expect(() => exigirDatosEmisor(empresa, '0001')).toThrow(DatosEmisorIncompletosError);
    expect(emisorDePrueba(empresa)).toMatchObject({ ruc: EMPRESA.ruc, codigoEstablecimiento: '0000' });
  });

  it('no existe o es de otro tenant → EMPRESA_NO_ENCONTRADA', async () => {
    await expect(new EmpresaEmisoraOrg(consultaQueNoEncuentra(), listadoVacio).obtener('otra')).rejects.toThrow(EmpresaNoEncontradaError);
  });

  it('listarActivas pide a ORG solo las activas, en una página del límite, y las mapea', async () => {
    const filtros: unknown[] = [];
    const listar = {
      ejecutar: (filtro: unknown) => {
        filtros.push(filtro);
        return Promise.resolve({ items: [EMPRESA], total: 1 });
      },
    };
    const empresas = await new EmpresaEmisoraOrg(consultaQueNoEncuentra(), listar).listarActivas();
    expect(filtros).toEqual([{ activo: true, pagina: 1, tamano: LIMITE_EMPRESAS_EMISORAS }]);
    expect(empresas).toEqual([
      expect.objectContaining({ id: EMPRESA.id, razonSocial: 'RESTAURANTE EL SAZON SAC', domicilioFiscal: 'AV. LARCO 123, MIRAFLORES' }),
    ]);
  });
});

describe('SucursalesEmisorasOrg', () => {
  it('codigoEstablecimiento devuelve el anexo SUNAT de la sucursal, o null si ORG no lo tiene', async () => {
    expect(await new SucursalesEmisorasOrg(consultaQueDevuelve(SUCURSAL)).codigoEstablecimiento(SUCURSAL.id)).toBe('0001');
    const sinAnexo = new SucursalesEmisorasOrg(consultaQueDevuelve({ ...SUCURSAL, codigoEstablecimientoSunat: null }));
    expect(await sinAnexo.codigoEstablecimiento(SUCURSAL.id)).toBeNull();
  });

  it('sucursal inexistente → SUCURSAL_NO_ENCONTRADA, también en exigirDeLaEmpresa', async () => {
    const sucursales = new SucursalesEmisorasOrg(consultaQueNoEncuentra());
    await expect(sucursales.codigoEstablecimiento('otra')).rejects.toThrow(SucursalNoEncontradaError);
    await expect(sucursales.exigirDeLaEmpresa('otra', EMPRESA.id)).rejects.toThrow(SucursalNoEncontradaError);
  });

  it('exigirDeLaEmpresa: de otra empresa → SUCURSAL_NO_ENCONTRADA; de la empresa, pasa', async () => {
    const sucursales = new SucursalesEmisorasOrg(consultaQueDevuelve(SUCURSAL));
    await expect(sucursales.exigirDeLaEmpresa(SUCURSAL.id, EMPRESA.id)).resolves.toBeUndefined();
    await expect(sucursales.exigirDeLaEmpresa(SUCURSAL.id, 'otra-empresa')).rejects.toThrow(SucursalNoEncontradaError);
  });
});
