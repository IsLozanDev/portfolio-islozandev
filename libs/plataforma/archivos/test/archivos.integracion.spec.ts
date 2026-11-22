import { ConflictError } from '@vitrina/plataforma/kernel';
import { AlsTenantContext, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import { Archivo, type ContenidoAnalizado } from '../src/domain/archivo.js';
import { CODIGOS_CATEGORIA, type CategoriaArchivo } from '../src/domain/categoria.js';
import { ArchivosAtascadosSql } from '../src/infrastructure/typeorm/archivos-atascados.sql.js';
import { RepositorioArchivosTypeOrm } from '../src/infrastructure/typeorm/archivos.repositorio.js';
import { CargasPendientesSql } from '../src/infrastructure/typeorm/cargas-pendientes.sql.js';
import { ENTIDADES_ARC, VersionArchivoEntidad } from '../src/infrastructure/typeorm/entidades.js';
import { DIEZ_MEGABYTES, MIME_DOCX, VEINTICINCO_MEGABYTES } from './support/categorias.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const BYTES_PDF = 1_258_291;
const CONTENIDO_PDF: ContenidoAnalizado = { hash: 'a'.repeat(64), bytes: BYTES_PDF, mimeReal: 'application/pdf' };
const LIMITE_LIMPIEZA = 200;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

describeConDb('Archivos con TypeORM (TR-RF-080, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let repositorio: RepositorioArchivosTypeOrm;
  const tenantA = uuidV7();
  const tenantB = uuidV7();
  const usuario = uuidV7();

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(trabajo));

  async function solicitarContrato(tenantId: string): Promise<Archivo> {
    return enTenant(tenantId, async () => {
      const categoria = await repositorio.buscarCategoria('DOCUMENTO');
      if (!categoria) throw new Error('falta la categoría DOCUMENTO sembrada');
      const archivo = Archivo.solicitar(
        {
          id: uuidV7(),
          tenantId,
          nombreOriginal: 'contrato.pdf',
          mimeDeclarado: 'application/pdf',
          bytesDeclarados: BYTES_PDF,
          entidadTipo: 'PRUEBA_SENSIBLE',
          entidadId: 'E-1',
          solicitadoPor: usuario,
        },
        categoria,
      );
      await repositorio.guardar(archivo);
      return archivo;
    });
  }

  async function obtenerExistente(tenantId: string, archivoId: string): Promise<Archivo> {
    const archivo = await enTenant(tenantId, () => repositorio.obtener(archivoId));
    if (!archivo) throw new Error('el archivo debía existir');
    return archivo;
  }

  async function versionEnBase(archivoId: string): Promise<number | undefined> {
    const filas = (await dataSource.query('SELECT version FROM arc.archivo WHERE id = $1', [archivoId])) as { version: number }[];
    return filas[0]?.version;
  }

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_ARC });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    repositorio = new RepositorioArchivosTypeOrm(unidadDeTrabajo, contexto);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('lee las cinco categorías sembradas con su lista de MIME y su máximo', async () => {
    const categorias = await enTenant(tenantA, () => Promise.all(CODIGOS_CATEGORIA.map((codigo) => repositorio.buscarCategoria(codigo))));

    expect(categorias.map((categoria) => categoria?.codigo)).toEqual([...CODIGOS_CATEGORIA]);
    expect(categorias[0]).toMatchObject({ codigo: 'IMAGEN', tamanoMaxBytes: DIEZ_MEGABYTES, sensible: false });
    expect(categorias[1]).toMatchObject({
      codigo: 'DOCUMENTO',
      mimesPermitidos: ['application/pdf', MIME_DOCX, 'image/jpeg'],
      tamanoMaxBytes: VEINTICINCO_MEGABYTES,
      sensible: true,
    });
  });

  it('lista las cinco categorías sembradas por código', async () => {
    const categorias = await enTenant(tenantA, () => repositorio.listarCategorias());

    expect(categorias.map((categoria) => categoria.codigo)).toEqual([...CODIGOS_CATEGORIA].sort());
    expect(categorias.find((categoria) => categoria.codigo === 'IMAGEN')).toMatchObject({ tamanoMaxBytes: DIEZ_MEGABYTES });
  });

  it('una categoría que no existe es nula', async () => {
    expect(await enTenant(tenantA, () => repositorio.buscarCategoria('VIDEO'))).toBeNull();
  });

  it('guarda y lee un archivo pendiente con su versión 1', async () => {
    const archivo = await solicitarContrato(tenantA);

    const leido = await obtenerExistente(tenantA, archivo.id);

    expect(leido).toMatchObject({
      id: archivo.id,
      tenantId: tenantA,
      categoria: 'DOCUMENTO',
      entidadTipo: 'PRUEBA_SENSIBLE',
      entidadId: 'E-1',
      nombreOriginal: 'contrato.pdf',
      estado: 'PENDIENTE_CARGA',
      motivoRechazo: null,
      versionVigente: null,
      creadoPor: usuario,
      version: 1,
    });
    expect(leido.primeraVersion).toEqual({
      numero: 1,
      rutaStorage: `${tenantA}/${archivo.id}/1`,
      estado: 'PENDIENTE_CARGA',
      mimeDeclarado: 'application/pdf',
      bytesDeclarados: BYTES_PDF,
      hashSha256: null,
      bytes: null,
      mimeReal: null,
      subidoPor: usuario,
    });
  });

  it('cada cambio de estado sube la versión de la fila, con evento o sin él', async () => {
    const archivo = await solicitarContrato(tenantA);

    await enTenant(tenantA, async () => {
      const leido = await repositorio.obtener(archivo.id);
      leido?.confirmarCarga();
      await repositorio.guardar(leido as Archivo);
    });
    expect(await versionEnBase(archivo.id)).toBe(2);

    await enTenant(tenantA, async () => {
      const leido = await repositorio.obtener(archivo.id);
      leido?.aprobar(CONTENIDO_PDF);
      await repositorio.guardar(leido as Archivo);
      expect(leido?.pullEvents()[0]?.aggregateVersion).toBe(3);
    });

    const final = await obtenerExistente(tenantA, archivo.id);
    expect(final).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 1, version: 3 });
    expect(final.primeraVersion).toMatchObject({ hashSha256: CONTENIDO_PDF.hash, bytes: BYTES_PDF, mimeReal: 'application/pdf' });
  });

  it('guarda el rechazo con su motivo', async () => {
    const archivo = await solicitarContrato(tenantA);

    await enTenant(tenantA, async () => {
      const leido = (await repositorio.obtener(archivo.id)) as Archivo;
      leido.confirmarCarga();
      leido.rechazar('TIPO_NO_PERMITIDO');
      await repositorio.guardar(leido);
    });

    expect(await obtenerExistente(tenantA, archivo.id)).toMatchObject({ estado: 'RECHAZADO', motivoRechazo: 'TIPO_NO_PERMITIDO' });
  });

  it('el mismo objeto se puede guardar en dos transacciones seguidas', async () => {
    const archivo = await solicitarContrato(tenantA);

    await enTenant(tenantA, async () => {
      archivo.confirmarCarga();
      await repositorio.guardar(archivo);
    });
    await enTenant(tenantA, async () => {
      archivo.devolverAPendiente();
      await repositorio.guardar(archivo);
    });

    expect(await obtenerExistente(tenantA, archivo.id)).toMatchObject({ estado: 'PENDIENTE_CARGA', version: 3 });
  });

  it('conflicto de versión: dos lecturas del mismo archivo, la segunda escritura falla', async () => {
    const archivo = await solicitarContrato(tenantA);
    const primeraLectura = await obtenerExistente(tenantA, archivo.id);
    const segundaLectura = await obtenerExistente(tenantA, archivo.id);

    primeraLectura.confirmarCarga();
    await enTenant(tenantA, () => repositorio.guardar(primeraLectura));
    segundaLectura.confirmarCarga();

    await expect(enTenant(tenantA, () => repositorio.guardar(segundaLectura))).rejects.toThrow(ConflictError);
    expect(await versionEnBase(archivo.id)).toBe(2);
  });

  it('aislamiento por tenant: B no lee, no modifica ni borra el archivo de A (TR-CA-205)', async () => {
    const archivo = await solicitarContrato(tenantA);
    const leidoPorA = await obtenerExistente(tenantA, archivo.id);

    expect(await enTenant(tenantB, () => repositorio.obtener(archivo.id))).toBeNull();
    leidoPorA.confirmarCarga();
    await expect(enTenant(tenantB, () => repositorio.guardar(leidoPorA))).rejects.toThrow(ConflictError);
    await enTenant(tenantB, () => repositorio.eliminar(archivo.id));

    expect(await obtenerExistente(tenantA, archivo.id)).toMatchObject({ estado: 'PENDIENTE_CARGA', version: 1 });
  });

  it('eliminar borra el archivo con su versión y no falla si ya no existe', async () => {
    const archivo = await solicitarContrato(tenantA);

    await enTenant(tenantA, () => repositorio.eliminar(archivo.id));
    await enTenant(tenantA, () => repositorio.eliminar(archivo.id));

    expect(await enTenant(tenantA, () => repositorio.obtener(archivo.id))).toBeNull();
    const [{ versiones }] = (await dataSource.query('SELECT count(*)::int AS versiones FROM arc.version_archivo WHERE archivo_id = $1', [
      archivo.id,
    ])) as [{ versiones: number }];
    expect(versiones).toBe(0);
  });

  it('CargasPendientesSql lista los pendientes vencidos de todos los tenants, sin contexto de tenant', async () => {
    const deA = await solicitarContrato(tenantA);
    const deB = await solicitarContrato(tenantB);
    const enAnalisis = await solicitarContrato(tenantA);
    await enTenant(tenantA, async () => {
      enAnalisis.confirmarCarga();
      await repositorio.guardar(enAnalisis);
    });
    const cargasPendientes = new CargasPendientesSql(dataSource);
    const manana = new Date(Date.now() + UN_DIA_MS);
    const ayer = new Date(Date.now() - UN_DIA_MS);

    const vencidas = await cargasPendientes.listarVencidas(manana, LIMITE_LIMPIEZA);

    expect(vencidas).toEqual(expect.arrayContaining([
      { tenantId: tenantA, archivoId: deA.id },
      { tenantId: tenantB, archivoId: deB.id },
    ]));
    expect(vencidas.map((carga) => carga.archivoId)).not.toContain(enAnalisis.id);
    expect(await cargasPendientes.listarVencidas(ayer, LIMITE_LIMPIEZA)).toEqual([]);
    expect(await cargasPendientes.listarVencidas(manana, 1)).toHaveLength(1);
  });

  it('ArchivosAtascadosSql lista los EN_ANALISIS de todos los tenants por la fecha en que pasaron a ese estado (spec 34)', async () => {
    const pendiente = await solicitarContrato(tenantA);
    const confirmados: Archivo[] = [];
    for (const tenantId of [tenantA, tenantB]) {
      const archivo = await solicitarContrato(tenantId);
      await enTenant(tenantId, async () => {
        archivo.confirmarCarga();
        await repositorio.guardar(archivo);
      });
      confirmados.push(archivo);
    }
    const [deA, deB] = confirmados;
    const atascados = new ArchivosAtascadosSql(dataSource);
    const manana = new Date(Date.now() + UN_DIA_MS);
    const ayer = new Date(Date.now() - UN_DIA_MS);

    const enAnalisis = await atascados.listarEnAnalisisAntesDe(manana, LIMITE_LIMPIEZA);

    expect(enAnalisis).toEqual(expect.arrayContaining([
      { tenantId: tenantA, archivoId: deA.id, numero: 1 },
      { tenantId: tenantB, archivoId: deB.id, numero: 1 },
    ]));
    expect(enAnalisis.map((trabajo) => trabajo.archivoId)).not.toContain(pendiente.id);
    expect(await atascados.listarEnAnalisisAntesDe(ayer, LIMITE_LIMPIEZA)).toEqual([]);
    expect(await atascados.listarEnAnalisisAntesDe(manana, 1)).toHaveLength(1);
    // El barrido cuenta desde actualizado_en: el ORM la mueve al guardar el paso a EN_ANALISIS.
    const [{ movida }] = (await dataSource.query('SELECT actualizado_en > creado_en AS movida FROM arc.archivo WHERE id = $1', [deA.id])) as [
      { movida: boolean },
    ];
    expect(movida).toBe(true);
  });

  describe('versiones (spec 35)', () => {
    const categoriaDocumento = async () => (await repositorio.buscarCategoria('DOCUMENTO')) as CategoriaArchivo;
    const pedido = { mimeDeclarado: 'application/pdf', bytesDeclarados: BYTES_PDF, solicitadoPor: usuario };
    const contenidoDe = (marca: string): ContenidoAnalizado => ({ ...CONTENIDO_PDF, hash: marca.repeat(64) });

    /** Lee, aplica el cambio y guarda en una transacción del tenant. */
    async function cambiar(tenantId: string, archivoId: string, cambio: (archivo: Archivo, categoria: CategoriaArchivo) => void): Promise<void> {
      await enTenant(tenantId, async () => {
        const archivo = (await repositorio.obtener(archivoId)) as Archivo;
        cambio(archivo, await categoriaDocumento());
        await repositorio.guardar(archivo);
      });
    }

    async function disponible(tenantId: string): Promise<Archivo> {
      const archivo = await solicitarContrato(tenantId);
      await cambiar(tenantId, archivo.id, (leido) => {
        leido.confirmarCarga();
        leido.aprobar(contenidoDe('1'));
      });
      return archivo;
    }

    async function conVersionEnAnalisis(tenantId: string): Promise<Archivo> {
      const archivo = await disponible(tenantId);
      await cambiar(tenantId, archivo.id, (leido, categoria) => {
        leido.solicitarVersion(pedido, categoria);
        leido.confirmarVersion(2);
      });
      return archivo;
    }

    it('guarda y lee las versiones con su estado; listarVersiones trae quién y cuándo, por número', async () => {
      const archivo = await disponible(tenantA);

      await cambiar(tenantA, archivo.id, (leido, categoria) => leido.solicitarVersion(pedido, categoria));

      const leido = await obtenerExistente(tenantA, archivo.id);
      expect(leido.versiones.map((version) => [version.numero, version.estado, version.rutaStorage])).toEqual([
        [1, 'DISPONIBLE', `${tenantA}/${archivo.id}/1`],
        [2, 'PENDIENTE_CARGA', `${tenantA}/${archivo.id}/2`],
      ]);
      expect(leido.versionEnCurso?.numero).toBe(2);
      const registradas = await enTenant(tenantA, () => repositorio.listarVersiones(archivo.id));
      expect(registradas.map((version) => [version.numero, version.subidoPor, version.subidoEn instanceof Date])).toEqual([
        [1, usuario, true],
        [2, usuario, true],
      ]);
    });

    it('aprobar una versión la deja vigente con su contenido; la vigente anterior sigue DISPONIBLE', async () => {
      const archivo = await conVersionEnAnalisis(tenantA);

      await cambiar(tenantA, archivo.id, (leido) => leido.aprobarVersion(2, contenidoDe('2')));

      const leido = await obtenerExistente(tenantA, archivo.id);
      expect(leido).toMatchObject({ estado: 'DISPONIBLE', versionVigente: 2 });
      expect(leido.versionNumero(2)).toMatchObject({ estado: 'DISPONIBLE', hashSha256: '2'.repeat(64), bytes: BYTES_PDF });
      expect(leido.versionNumero(1)?.estado).toBe('DISPONIBLE');
    });

    it('una versión rechazada se borra con su motivo en el archivo; el siguiente intento reutiliza su número', async () => {
      const archivo = await conVersionEnAnalisis(tenantA);

      await cambiar(tenantA, archivo.id, (leido) => leido.rechazarVersion(2, { motivo: 'IDENTICA', versionCoincidente: 1 }));
      const rechazado = await obtenerExistente(tenantA, archivo.id);
      await cambiar(tenantA, archivo.id, (leido, categoria) => leido.solicitarVersion(pedido, categoria));
      const reintento = await obtenerExistente(tenantA, archivo.id);

      expect(rechazado.versiones.map((version) => version.numero)).toEqual([1]);
      expect(rechazado.rechazoVersion).toEqual({ motivo: 'IDENTICA', versionCoincidente: 1 });
      expect(reintento.versionNumero(2)?.estado).toBe('PENDIENTE_CARGA');
      expect(reintento.rechazoVersion).toBeNull();
    });

    it('la cuarentena de una versión conserva su fila y su hash; descartar una pendiente la borra', async () => {
      const archivo = await conVersionEnAnalisis(tenantA);
      await cambiar(tenantA, archivo.id, (leido) => leido.ponerVersionEnCuarentena(2, { ...contenidoDe('e'), firma: 'EICAR-Test-File' }));
      await cambiar(tenantA, archivo.id, (leido, categoria) => leido.solicitarVersion(pedido, categoria));

      await cambiar(tenantA, archivo.id, (leido) => leido.descartarVersionPendiente(3));

      const leido = await obtenerExistente(tenantA, archivo.id);
      expect(leido.versiones.map((version) => [version.numero, version.estado, version.hashSha256])).toEqual([
        [1, 'DISPONIBLE', '1'.repeat(64)],
        [2, 'CUARENTENA', 'e'.repeat(64)],
      ]);
    });

    it('marcar vigente sube la versión de la fila; un conflicto de bloqueo optimista entre dos lecturas falla la segunda', async () => {
      const archivo = await disponible(tenantA);
      await cambiar(tenantA, archivo.id, (leido, categoria) => {
        leido.solicitarVersion(pedido, categoria);
        leido.confirmarVersion(2);
        leido.aprobarVersion(2, contenidoDe('2'));
      });
      const versionAntes = await versionEnBase(archivo.id);
      const primeraLectura = await obtenerExistente(tenantA, archivo.id);
      const segundaLectura = await obtenerExistente(tenantA, archivo.id);

      primeraLectura.marcarVigente(1);
      await enTenant(tenantA, () => repositorio.guardar(primeraLectura));
      segundaLectura.solicitarVersion(pedido, await enTenant(tenantA, categoriaDocumento));

      await expect(enTenant(tenantA, () => repositorio.guardar(segundaLectura))).rejects.toThrow(ConflictError);
      expect(await versionEnBase(archivo.id)).toBe((versionAntes as number) + 1);
      expect((await obtenerExistente(tenantA, archivo.id)).versiones.map((version) => version.numero)).toEqual([1, 2]);
    });

    it('ux_version_en_curso: la base rechaza una segunda versión en curso aunque se salte el dominio', async () => {
      const archivo = await conVersionEnAnalisis(tenantA);

      const insertarOtraEnCurso = enTenant(tenantA, () =>
        unidadDeTrabajo.manager.getRepository(VersionArchivoEntidad).insert({
          archivoId: archivo.id,
          numero: 3,
          tenantId: tenantA,
          rutaStorage: `${tenantA}/${archivo.id}/3`,
          estado: 'PENDIENTE_CARGA',
          mimeDeclarado: 'application/pdf',
          bytesDeclarados: String(BYTES_PDF),
          subidoPor: usuario,
        }),
      );

      await expect(insertarOtraEnCurso).rejects.toThrow(/ux_version_en_curso/);
    });

    it('aislamiento: B no lista ni modifica las versiones de A', async () => {
      const archivo = await conVersionEnAnalisis(tenantA);
      const leidoPorA = await obtenerExistente(tenantA, archivo.id);
      leidoPorA.aprobarVersion(2, contenidoDe('2'));

      expect(await enTenant(tenantB, () => repositorio.listarVersiones(archivo.id))).toEqual([]);
      await expect(enTenant(tenantB, () => repositorio.guardar(leidoPorA))).rejects.toThrow(ConflictError);
      expect((await obtenerExistente(tenantA, archivo.id)).versionNumero(2)?.estado).toBe('EN_ANALISIS');
    });

    it('CargasPendientesSql lista las versiones nuevas pendientes vencidas de todos los tenants, sin la versión 1', async () => {
      const deA = await disponible(tenantA);
      const deB = await disponible(tenantB);
      for (const [tenantId, archivo] of [[tenantA, deA], [tenantB, deB]] as const) {
        await cambiar(tenantId, archivo.id, (leido, categoria) => leido.solicitarVersion(pedido, categoria));
      }
      const pendienteV1 = await solicitarContrato(tenantA);
      const cargasPendientes = new CargasPendientesSql(dataSource);

      const vencidas = await cargasPendientes.listarVersionesVencidas(new Date(Date.now() + UN_DIA_MS), LIMITE_LIMPIEZA);

      expect(vencidas).toEqual(expect.arrayContaining([
        { tenantId: tenantA, archivoId: deA.id, numero: 2 },
        { tenantId: tenantB, archivoId: deB.id, numero: 2 },
      ]));
      expect(vencidas.map((version) => version.archivoId)).not.toContain(pendienteV1.id);
      expect(await cargasPendientes.listarVersionesVencidas(new Date(Date.now() - UN_DIA_MS), LIMITE_LIMPIEZA)).toEqual([]);
    });

    it('ArchivosAtascadosSql lista también las versiones nuevas EN_ANALISIS, con su número', async () => {
      const archivo = await conVersionEnAnalisis(tenantB);

      const enAnalisis = await new ArchivosAtascadosSql(dataSource).listarEnAnalisisAntesDe(new Date(Date.now() + UN_DIA_MS), LIMITE_LIMPIEZA);

      expect(enAnalisis).toContainEqual({ tenantId: tenantB, archivoId: archivo.id, numero: 2 });
    });
  });
});
