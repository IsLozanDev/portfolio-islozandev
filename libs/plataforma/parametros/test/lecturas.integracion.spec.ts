import { ConsultarNiveles } from '../src/application/consultar-niveles.js';
import { FijarValor } from '../src/application/fijar-valor.js';
import { ListarParametros } from '../src/application/listar-parametros.js';
import { BusquedaDefinicionesTypeOrm } from '../src/infrastructure/typeorm/busqueda-definiciones.typeorm.js';
import { LecturaNivelesTypeOrm } from '../src/infrastructure/typeorm/lectura-niveles.typeorm.js';
import { crearEntornoValores, type EntornoValores, type Organizacion } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const PROPINA = 'rest.propina.porcentaje';

describeConDb('ListarParametros y ConsultarNiveles con ORM (PostgreSQL 16)', () => {
  let entorno: EntornoValores;
  let organizacion: Organizacion;
  let listar: ListarParametros;
  let consultar: ConsultarNiveles;
  const comoAna = <T>(trabajo: () => Promise<T>, sucursalId?: string) => entorno.contexto.run({ tenantId: organizacion.tenantId, branchId: sucursalId }, trabajo);

  beforeAll(async () => {
    entorno = await crearEntornoValores();
    await entorno.definicion({ codigo: PROPINA, producto: 'REST', tipo: 'NUMERO', defecto: 10, maximo: 'SUCURSAL' });
    await entorno.definicion({ codigo: 'rest.salon.cien_por_ciento', producto: 'REST', tipo: 'BOOLEANO', defecto: false, maximo: 'SUCURSAL' });
    await entorno.definicion({ codigo: 'gym.clase.cupo', producto: 'GYM', tipo: 'NUMERO', defecto: 20, maximo: 'SUCURSAL' });
    await entorno.definicion({ codigo: 'plat.sesion.minutos_inactividad', producto: 'PLAT', tipo: 'NUMERO', defecto: 30, maximo: 'TENANT' });
    await entorno.definicion({ codigo: 'rest.salon.retirado', producto: 'REST', tipo: 'NUMERO', defecto: 1, maximo: 'TENANT', obsoleto: true });
    organizacion = await entorno.organizacion();
    const { unidadDeTrabajo, contexto } = entorno;
    const { resolucion, definiciones } = entorno.dependencias;
    listar = new ListarParametros({
      unidadDeTrabajo,
      contexto,
      definiciones: new BusquedaDefinicionesTypeOrm(unidadDeTrabajo),
      resolucion,
      productos: { vigentes: async () => ['REST'] },
    });
    consultar = new ConsultarNiveles({ unidadDeTrabajo, definiciones, niveles: new LecturaNivelesTypeOrm(unidadDeTrabajo, contexto) });

    const fijar = new FijarValor(entorno.dependencias);
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'SUCURSAL', sucursalId: organizacion.jockey, valor: 0, actorId: organizacion.usuarioId }));
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'EMPRESA', empresaId: organizacion.empresaLima, valor: 12, actorId: organizacion.usuarioId }));
    await comoAna(() => fijar.ejecutar({ codigo: PROPINA, alcance: 'TENANT', valor: 10, actorId: organizacion.usuarioId }));
  });

  afterAll(() => entorno?.cerrar());

  it('lista PLAT y los contratados, sin obsoletos ni productos no contratados, con el efectivo de la sucursal', async () => {
    const listados = await comoAna(() => listar.ejecutar(), organizacion.jockey);
    expect(listados.map((listado) => listado.definicion.codigo)).toEqual(['plat.sesion.minutos_inactividad', PROPINA, 'rest.salon.cien_por_ciento']);
    expect(listados.find((listado) => listado.definicion.codigo === PROPINA)?.efectivo).toEqual({ valor: 0, origen: 'SUCURSAL' });
  });

  it('busca por texto en código o descripción y trata % y _ como literales', async () => {
    expect((await comoAna(() => listar.ejecutar({ texto: 'PROPINA' }))).map((listado) => listado.definicion.codigo)).toEqual([PROPINA]);
    expect((await comoAna(() => listar.ejecutar({ texto: 'cien_por' }))).map((listado) => listado.definicion.codigo)).toEqual(['rest.salon.cien_por_ciento']);
    expect(await comoAna(() => listar.ejecutar({ texto: '%' }))).toEqual([]);
  });

  it('con obsoletos=true incluye las retiradas', async () => {
    const listados = await comoAna(() => listar.ejecutar({ productoCodigo: 'REST', incluirObsoletas: true }));
    expect(listados.map((listado) => listado.definicion.codigo)).toContain('rest.salon.retirado');
  });

  it('la tabla de herencia trae tenant, empresa y sucursal con su nombre y actor', async () => {
    const { niveles } = await comoAna(() => consultar.ejecutar(PROPINA));
    expect(niveles.map((nivel) => [nivel.alcance, nivel.entidadNombre, nivel.valor, nivel.modificadoPor, nivel.fueraDeAlcance])).toEqual([
      ['TENANT', null, 10, organizacion.usuarioId, false],
      ['EMPRESA', 'Cfg Lima SAC', 12, organizacion.usuarioId, false],
      ['SUCURSAL', 'Food court Jockey', 0, organizacion.usuarioId, false],
    ]);
  });

  it('otro tenant no ve los niveles de este', async () => {
    const otra = await entorno.organizacion();
    const { niveles } = await entorno.contexto.run({ tenantId: otra.tenantId }, () => consultar.ejecutar(PROPINA));
    expect(niveles).toEqual([]);
  });
});
