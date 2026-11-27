import { ArchivoNoEncontradoError, type ArchivoPort, type EstadoArchivo } from '@vitrina/plataforma/archivos';
import { ValidadorLogoArchivos } from '../src/org/validador-logo.archivos.js';

const EMPRESA = '0190a8e0-0000-7000-8000-0000000000e1';
const OTRA_EMPRESA = '0190a8e0-0000-7000-8000-0000000000e2';
const ARCHIVO = '0190a8e0-0000-7000-8000-00000000a001';

const logoDisponible = (cambios: Partial<EstadoArchivo> = {}): EstadoArchivo => ({
  archivoId: ARCHIVO,
  estado: 'DISPONIBLE',
  categoria: 'LOGO',
  entidadTipo: 'EMPRESA',
  entidadId: EMPRESA,
  nombreOriginal: 'logo.png',
  ...cambios,
});

/** Solo `estado` importa al validador; lo demás no se llama. */
function archivosQue(responder: () => Promise<EstadoArchivo>): { archivos: ArchivoPort; consultas: string[] } {
  const consultas: string[] = [];
  const archivos = {
    estado: (archivoId: string) => {
      consultas.push(archivoId);
      return responder();
    },
  } as unknown as ArchivoPort;
  return { archivos, consultas };
}

const validar = (responder: () => Promise<EstadoArchivo>) => new ValidadorLogoArchivos(archivosQue(responder).archivos).validar(ARCHIVO, EMPRESA);

describe('ValidadorLogoArchivos (spec 17d)', () => {
  it('un LOGO DISPONIBLE de la misma empresa es válido', async () => {
    const { archivos, consultas } = archivosQue(async () => logoDisponible());

    await expect(new ValidadorLogoArchivos(archivos).validar(ARCHIVO, EMPRESA)).resolves.toEqual({ valido: true });
    expect(consultas).toEqual([ARCHIVO]);
  });

  it('un archivo que ARC no encuentra (inexistente o de otro tenant) → NO_ENCONTRADO', async () => {
    await expect(validar(() => Promise.reject(new ArchivoNoEncontradoError()))).resolves.toEqual({ valido: false, motivo: 'NO_ENCONTRADO' });
  });

  it('otra categoría → CATEGORIA', async () => {
    await expect(validar(async () => logoDisponible({ categoria: 'IMAGEN' }))).resolves.toEqual({ valido: false, motivo: 'CATEGORIA' });
  });

  it.each([
    ['otra empresa', { entidadId: OTRA_EMPRESA }],
    ['otro tipo de entidad', { entidadTipo: 'PERSONA' }],
  ])('un logo de %s → OTRA_ENTIDAD', async (_caso, cambios) => {
    await expect(validar(async () => logoDisponible(cambios))).resolves.toEqual({ valido: false, motivo: 'OTRA_ENTIDAD' });
  });

  it.each(['PENDIENTE_CARGA', 'EN_ANALISIS', 'CUARENTENA', 'RECHAZADO'] as const)('un logo %s → NO_DISPONIBLE', async (estado) => {
    await expect(validar(async () => logoDisponible({ estado }))).resolves.toEqual({ valido: false, motivo: 'NO_DISPONIBLE' });
  });

  it('otro error de ARC se propaga', async () => {
    await expect(validar(() => Promise.reject(new Error('base caída')))).rejects.toThrow('base caída');
  });
});
