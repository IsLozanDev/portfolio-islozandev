import { createHash } from 'node:crypto';
import { GuardarArchivoSistema } from '../src/application/guardar-archivo-sistema.js';
import type { GuardarArchivoComando } from '../src/application/ports/archivo-sistema.port.js';
import { CategoriaDesconocidaError, MimeNoPermitidoError } from '../src/domain/errores.js';
import { EVENTOS_ARC } from '../src/domain/eventos-arc.js';
import { AlmacenArchivosMemoria } from '../src/infrastructure/memoria/almacen-archivos.memoria.js';
import {
  AHORA,
  ContextoFijo,
  IdsEnOrden,
  PublicadorMemoria,
  RepositorioArchivosMemoria,
  TENANT_A,
  TENANT_B,
  UnidadDeTrabajoDirecta,
} from './support/dobles.js';
import { RelojFijo } from './support/reloj-fijo.js';

const XML = new TextEncoder().encode('<Invoice/>');
const RUTA_PRIMER_ARCHIVO = `${TENANT_A}/00000000-0000-4000-8000-000000000001/1`;

/** El repositorio cuya escritura falla, para ver que el objeto subido se borra. */
class RepositorioQueFalla extends RepositorioArchivosMemoria {
  override guardar(): Promise<void> {
    return Promise.reject(new Error('la base no responde'));
  }
}

function comando(cambios: Partial<GuardarArchivoComando> = {}): GuardarArchivoComando {
  return {
    categoria: 'CPE_XML',
    nombreOriginal: '20601234561-01-F001-00000001.xml',
    mime: 'application/xml',
    bytes: XML,
    entidadTipo: 'FE_COMPROBANTE',
    entidadId: 'C-1',
    ...cambios,
  };
}

function armar(repositorio?: (contexto: ContextoFijo) => RepositorioArchivosMemoria) {
  const unidadDeTrabajo = new UnidadDeTrabajoDirecta();
  const contexto = new ContextoFijo({ tenantId: TENANT_A });
  const archivos = repositorio?.(contexto) ?? new RepositorioArchivosMemoria(contexto);
  const almacen = new AlmacenArchivosMemoria(new RelojFijo(AHORA));
  const publicador = new PublicadorMemoria(unidadDeTrabajo);
  const caso = new GuardarArchivoSistema({ unidadDeTrabajo, contexto, ids: new IdsEnOrden(), publicador, archivos, almacen });
  return { caso, contexto, archivos, almacen, publicador };
}

describe('GuardarArchivoSistema', () => {
  it('sube los bytes y registra el archivo DISPONIBLE con su hash y archivo.disponible en la transacción', async () => {
    const { caso, archivos, almacen, publicador } = armar();

    const guardado = await caso.guardar(comando());

    const hash = createHash('sha256').update(XML).digest('hex');
    expect(guardado).toEqual({ archivoId: '00000000-0000-4000-8000-000000000001', hashSha256: hash, bytes: XML.byteLength });
    expect(await almacen.leer(RUTA_PRIMER_ARCHIVO)).toEqual(XML);
    expect(archivos.guardados[0]).toMatchObject({ estado: 'DISPONIBLE', origen: 'SISTEMA', creadoPor: null, tenantId: TENANT_A });
    expect(archivos.guardados[0]?.primeraVersion).toMatchObject({ hashSha256: hash, subidoPor: null });
    expect(publicador.tipos()).toEqual([EVENTOS_ARC.disponible]);
    expect(publicador.publicadosEnTransaccion).toEqual([true]);
  });

  it('un MIME fuera de la categoría falla sin subir nada', async () => {
    const { caso, almacen, archivos } = armar();

    await expect(caso.guardar(comando({ mime: 'application/pdf' }))).rejects.toThrow(MimeNoPermitidoError);
    expect(almacen.existe(RUTA_PRIMER_ARCHIVO)).toBe(false);
    expect(archivos.guardados).toEqual([]);
  });

  it('una categoría desconocida falla sin subir nada', async () => {
    const { caso, almacen } = armar();

    await expect(caso.guardar(comando({ categoria: 'NO_EXISTE' }))).rejects.toThrow(CategoriaDesconocidaError);
    expect(almacen.existe(RUTA_PRIMER_ARCHIVO)).toBe(false);
  });

  it('si la transacción falla, borra el objeto subido y relanza', async () => {
    const { caso, almacen, publicador } = armar((contexto) => new RepositorioQueFalla(contexto));

    await expect(caso.guardar(comando())).rejects.toThrow('la base no responde');
    expect(almacen.existe(RUTA_PRIMER_ARCHIVO)).toBe(false);
    expect(publicador.eventos).toEqual([]);
  });

  it('el archivo queda en el tenant del contexto: otro tenant no lo ve', async () => {
    const { caso, contexto, archivos } = armar();

    const { archivoId } = await caso.guardar(comando());

    contexto.alcance = { tenantId: TENANT_B };
    expect(await archivos.obtener(archivoId)).toBeNull();
  });
});
