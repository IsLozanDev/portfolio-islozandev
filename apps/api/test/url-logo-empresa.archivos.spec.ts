import {
  ArchivoNoDisponibleError,
  ArchivoNoEncontradoError,
  VersionNoDisponibleError,
  type ArchivoPort,
  type UrlDescargaConsulta,
} from '@vitrina/plataforma/archivos';
import { AlsTenantContext } from '@vitrina/plataforma/kernel-infra';
import { UrlLogoEmpresaArchivos } from '../src/org/url-logo-empresa.archivos.js';

const OPERADOR = '0193f3a0-0000-7000-8000-0000000000aa';
const CLIENTE = '0193f3a0-0000-7000-8000-0000000000cc';
const LOGO = '0193f3a0-0000-7000-8000-00000000a0a0';
const FIRMADA = { url: 'https://storage.ejemplo/firmada/logo.png', expiraEn: new Date('2026-11-27T15:05:00Z') };

describe('UrlLogoEmpresaArchivos (spec 17d)', () => {
  const contexto = new AlsTenantContext();

  /** Anota en qué tenant y con qué consulta se pidió la URL. */
  function archivosQue(responder: () => Promise<typeof FIRMADA>) {
    const pedidos: { tenantId: string; consulta: UrlDescargaConsulta }[] = [];
    const archivos = {
      urlDescarga: (consulta: UrlDescargaConsulta) => {
        pedidos.push({ tenantId: contexto.current().tenantId, consulta });
        return responder();
      },
    } as unknown as ArchivoPort;
    return { firmante: new UrlLogoEmpresaArchivos(contexto, archivos), pedidos };
  }

  const desdeElOperador = <T>(trabajo: () => Promise<T>) => contexto.run({ tenantId: OPERADOR, actorId: 'admin' }, trabajo);

  it('firma en el tenant consultado, en línea y por 300 s, y vuelve al contexto del operador', async () => {
    const { firmante, pedidos } = archivosQue(async () => FIRMADA);

    const resultado = await desdeElOperador(async () => {
      const firmado = await firmante.firmar(CLIENTE, LOGO);
      return { firmado, tenantAlTerminar: contexto.current().tenantId };
    });

    expect(resultado).toEqual({ firmado: FIRMADA, tenantAlTerminar: OPERADOR });
    expect(pedidos).toEqual([{ tenantId: CLIENTE, consulta: { archivoId: LOGO, disposicion: 'inline', vigenciaSegundos: 300 } }]);
  });

  it.each([
    ['no existe', new ArchivoNoEncontradoError()],
    ['no está disponible', new ArchivoNoDisponibleError('CUARENTENA')],
    ['su versión no está disponible', new VersionNoDisponibleError('EN_ANALISIS')],
  ])('un logo que %s devuelve null', async (_caso, error) => {
    const { firmante } = archivosQue(() => Promise.reject(error));
    await expect(desdeElOperador(() => firmante.firmar(CLIENTE, LOGO))).resolves.toBeNull();
  });

  it('otro error de ARC se propaga', async () => {
    const { firmante } = archivosQue(() => Promise.reject(new Error('Storage caído')));
    await expect(desdeElOperador(() => firmante.firmar(CLIENTE, LOGO))).rejects.toThrow('Storage caído');
  });
});
