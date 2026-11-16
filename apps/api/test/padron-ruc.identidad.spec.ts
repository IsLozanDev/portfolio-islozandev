import {
  CuotaAgotadaError,
  DocumentoInvalidoError,
  DocumentoNoEncontradoError,
  ProveedorNoDisponibleError,
  type ConsultaDocumento,
  type IdentidadPort,
  type RespuestaConsulta,
} from '@vitrina/plataforma/identidad';
import { PadronRucIdentidad } from '../src/identidad/padron-ruc.identidad.js';

const RUC_NO_HABIDO = '20512345671';

const respuestaRuc: RespuestaConsulta = {
  tipo: 'RUC',
  fuente: 'PROVEEDOR',
  proveedor: 'DECOLECTA',
  consultadoEn: new Date('2026-11-16T12:00:00Z'),
  datos: { razonSocial: 'SABORES DEL SUR S.A.C.', estado: 'ACTIVO', condicion: 'NO HABIDO', direccionFiscal: 'Av. Ejército 101', ubigeo: '040101' },
  aptoFactura: false,
  motivoNoApto: 'NO HABIDO',
};

function identidadQue(responder: (consulta: ConsultaDocumento) => Promise<RespuestaConsulta>): { identidad: IdentidadPort; consultas: ConsultaDocumento[] } {
  const consultas: ConsultaDocumento[] = [];
  const identidad: IdentidadPort = {
    validar: () => ({ valido: true }),
    consultar: (consulta) => {
      consultas.push(consulta);
      return responder(consulta);
    },
  };
  return { identidad, consultas };
}

describe('PadronRucIdentidad (spec 28b)', () => {
  it('consulta el RUC con motivo VERIFICACION_IDENTIDAD y producto PLAT, y mapea razón social, estado y condición', async () => {
    const { identidad, consultas } = identidadQue(async () => respuestaRuc);

    await expect(new PadronRucIdentidad(identidad).consultar(RUC_NO_HABIDO)).resolves.toEqual({
      razonSocial: 'SABORES DEL SUR S.A.C.',
      estado: 'ACTIVO',
      condicion: 'NO HABIDO',
    });
    expect(consultas).toEqual([{ tipo: 'RUC', numero: RUC_NO_HABIDO, motivo: 'VERIFICACION_IDENTIDAD', productoCodigo: 'PLAT' }]);
  });

  it('RUC no encontrado (404) devuelve null', async () => {
    const { identidad } = identidadQue(async () => {
      throw new DocumentoNoEncontradoError();
    });
    await expect(new PadronRucIdentidad(identidad).consultar(RUC_NO_HABIDO)).resolves.toBeNull();
  });

  it('proveedor caído (503) devuelve null', async () => {
    const { identidad } = identidadQue(async () => {
      throw new ProveedorNoDisponibleError();
    });
    await expect(new PadronRucIdentidad(identidad).consultar(RUC_NO_HABIDO)).resolves.toBeNull();
  });

  it('cuota de consultas agotada (429) devuelve null (spec 29)', async () => {
    const { identidad } = identidadQue(async () => {
      throw new CuotaAgotadaError();
    });
    await expect(new PadronRucIdentidad(identidad).consultar(RUC_NO_HABIDO)).resolves.toBeNull();
  });

  it('cualquier otro error se propaga', async () => {
    const error = new DocumentoInvalidoError('DIGITO_VERIFICADOR');
    const { identidad } = identidadQue(async () => {
      throw error;
    });
    await expect(new PadronRucIdentidad(identidad).consultar(RUC_NO_HABIDO)).rejects.toBe(error);
  });
});
