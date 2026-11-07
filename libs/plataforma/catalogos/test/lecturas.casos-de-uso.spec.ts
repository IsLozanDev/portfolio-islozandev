import type { ContenidoItemComando } from '../src/application/contenido-item.js';
import { AjustarItem } from '../src/application/ajustar-item.js';
import { ConsultarItems, type ItemsConsultados } from '../src/application/consultar-items.js';
import { GuardarItemPropio } from '../src/application/guardar-item-propio.js';
import { EVENTO_ERROR_CACHE, LectorItems, claveItems, etagItems } from '../src/application/lector-items.js';
import type { CacheItems } from '../src/application/ports/repositorios.js';
import { ValidarItem } from '../src/application/validar-item.js';
import type { Catalogo } from '../src/domain/catalogo.js';
import { CatalogoNoExisteError } from '../src/domain/errores.js';
import { ItemCatalogo } from '../src/domain/item-catalogo.js';
import { fechaDeVigencia, Vigencia } from '../src/domain/vigencia.js';
import { CacheItemsMemoria } from '../src/infrastructure/cache-items.memoria.js';
import { ANA, AHORA, CLIENTE, escenario, type Escenario } from './support/dobles.js';

const OTRA_CLINICA = '0193f3a0-0000-7000-8000-000000000003';

const contenido = (cambios: Partial<ContenidoItemComando> = {}): ContenidoItemComando => ({
  codigoExterno: null,
  nombre: 'Tarjeta Diners',
  abreviatura: null,
  orden: 5,
  atributos: {},
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  ...cambios,
});

const CAIDA: CacheItems = {
  leer: async () => {
    throw new Error('redis://:clave@cache:6379 no responde');
  },
  guardar: async () => {
    throw new Error('redis://:clave@cache:6379 no responde');
  },
};

interface Lectura {
  actual: Escenario;
  avisos: Record<string, unknown>[];
  consultar: ConsultarItems;
  validar: ValidarItem;
  medioPago: Catalogo;
  plinId: string;
}

async function lectura(cache: CacheItems = new CacheItemsMemoria()): Promise<Lectura> {
  const actual = escenario();
  const avisos: Record<string, unknown>[] = [];
  const lector = new LectorItems({ lectura: actual.lectura, cache, reloj: actual.dependencias.reloj, aviso: (_mensaje, datos) => avisos.push(datos) });
  const { unidadDeTrabajo, contexto } = actual.dependencias;

  const medioPago = await actual.catalogo('MEDIO_PAGO', 'MIXTO');
  await actual.itemGlobal(medioPago, 'EFECTIVO');
  await actual.itemGlobal(medioPago, 'YAPE');
  const plinId = (await actual.itemGlobal(medioPago, 'PLIN')).id;
  const documentos = await actual.catalogo('TIPO_DOC_IDENTIDAD', 'GLOBAL');
  await actual.items.guardarGlobal(
    ItemCatalogo.crear({
      id: '0193f3a0-0000-7000-8000-0000000d0100',
      catalogo: documentos,
      tenantId: null,
      codigo: 'DNI',
      codigoExterno: '1',
      nombre: 'DNI',
      abreviatura: null,
      orden: 1,
      atributos: { longitud: 8, regex: '^[0-9]{8}$' },
      vigencia: Vigencia.de('2026-01-01', null),
      activo: true,
      por: ANA,
      ahora: AHORA,
    }),
    null,
  );
  actual.comoTenant(CLIENTE);

  return {
    actual,
    avisos,
    consultar: new ConsultarItems({ unidadDeTrabajo, contexto, lector }),
    validar: new ValidarItem({ unidadDeTrabajo, contexto, lector }),
    medioPago,
    plinId,
  };
}

const codigos = (resultado: ItemsConsultados) => (resultado.noModificado ? [] : resultado.items.map((item) => item.codigo));

describe('fechaDeVigencia', () => {
  it('usa el día de America/Lima: 03:00 UTC del 11 es todavía el 10 en Lima', () => {
    expect(fechaDeVigencia(new Date('2026-10-11T03:00:00Z'))).toBe('2026-10-10');
    expect(fechaDeVigencia(new Date('2026-10-11T05:00:00Z'))).toBe('2026-10-11');
  });
});

describe('claveItems y etagItems', () => {
  it('llevan las dos versiones y la fecha', () => {
    const versiones = { catalogoId: 'c', versionGlobal: 3, versionTenant: 0 };
    expect(claveItems('MEDIO_PAGO', CLIENTE, versiones, '2026-10-10')).toBe(`cat:MEDIO_PAGO:${CLIENTE}:3.0:2026-10-10`);
    expect(etagItems(versiones, '2026-10-10')).toBe('"3.0.2026-10-10"');
  });
});

describe('ConsultarItems (TR-RF-024, TR-RNF-102)', () => {
  it('TR-CA-063: los globales vigentes más «Tarjeta Diners» propio, con ETag', async () => {
    const { actual, consultar } = await lectura();
    await new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'DINERS', ...contenido(), actorId: ANA });
    const resultado = await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' });
    expect(codigos(resultado)).toEqual(['EFECTIVO', 'PLIN', 'YAPE', 'DINERS']);
    expect(resultado.etag).toBe('"4.1.2026-11-07"');
  });

  it('la segunda lectura sale de la caché', async () => {
    const { actual, consultar } = await lectura();
    await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' });
    await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' });
    expect(actual.lectura.lecturasDeItems).toBe(1);
  });

  it('TR-CA-064: con If-None-Match igual responde no modificado sin leer la caché ni los ítems', async () => {
    const leidas: string[] = [];
    const cache = new CacheItemsMemoria();
    const espia: CacheItems = { leer: (clave) => (leidas.push(clave), cache.leer(clave)), guardar: (clave, valor, ttl) => cache.guardar(clave, valor, ttl) };
    const { actual, consultar } = await lectura(espia);
    const { etag } = await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' });
    leidas.length = 0;

    expect(await consultar.ejecutar({ catalogo: 'MEDIO_PAGO', siNoCoincide: etag })).toEqual({ noModificado: true, etag });
    expect(await consultar.ejecutar({ catalogo: 'MEDIO_PAGO', siNoCoincide: `"x", W/${etag}` })).toMatchObject({ noModificado: true });
    expect(leidas).toEqual([]);
    expect(actual.lectura.lecturasDeItems).toBe(1);
    expect(await consultar.ejecutar({ catalogo: 'MEDIO_PAGO', siNoCoincide: '"1.0.2026-01-01"' })).toMatchObject({ noModificado: false });
  });

  it('un propio nuevo cambia el ETag solo de ese tenant', async () => {
    const { actual, consultar } = await lectura();
    const antesCliente = (await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })).etag;
    actual.comoTenant(OTRA_CLINICA);
    const antesOtra = (await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })).etag;

    actual.comoTenant(CLIENTE);
    await new GuardarItemPropio(actual.dependencias).crear({ catalogo: 'MEDIO_PAGO', codigo: 'DINERS', ...contenido(), actorId: ANA });
    expect((await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })).etag).not.toBe(antesCliente);
    actual.comoTenant(OTRA_CLINICA);
    expect((await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })).etag).toBe(antesOtra);
  });

  it('un cambio global cambia el ETag de todos los tenants', async () => {
    const { actual, consultar, medioPago } = await lectura();
    const antes = (await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })).etag;
    await actual.itemGlobal(medioPago, 'TARJETA');
    expect((await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' })).etag).not.toBe(antes);
  });

  it('TR-CA-062: desde 2027-01-01 no aparece el 2026-10-10 y sí el 2027-01-01, sin invalidar nada', async () => {
    const { actual, consultar } = await lectura();
    await new GuardarItemPropio(actual.dependencias).crear({
      catalogo: 'MEDIO_PAGO',
      codigo: 'CRIPTO',
      ...contenido({ nombre: 'Cripto', vigenteDesde: '2027-01-01' }),
      actorId: ANA,
    });
    actual.fijarAhora(new Date('2026-10-10T15:00:00Z'));
    expect(codigos(await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' }))).not.toContain('CRIPTO');
    actual.fijarAhora(new Date('2027-01-01T15:00:00Z'));
    expect(codigos(await consultar.ejecutar({ catalogo: 'MEDIO_PAGO' }))).toContain('CRIPTO');
  });

  it('TR-CA-065: un catálogo inexistente da CATALOGO_NO_EXISTE y no se cachea', async () => {
    const cache = new CacheItemsMemoria();
    const { consultar } = await lectura(cache);
    await expect(consultar.ejecutar({ catalogo: 'NO_EXISTE' })).rejects.toThrow(CatalogoNoExisteError);
    expect(cache.claves).toEqual([]);
  });

  it('con Redis caído responde lo mismo desde la base y deja el aviso cat.redis.error sin la URL', async () => {
    const conCache = await (await lectura()).consultar.ejecutar({ catalogo: 'MEDIO_PAGO' });
    const { consultar: sinCache, avisos } = await lectura(CAIDA);

    expect(await sinCache.ejecutar({ catalogo: 'MEDIO_PAGO' })).toEqual(conCache);
    expect(avisos).toEqual([
      { evento: EVENTO_ERROR_CACHE, error: 'Error' },
      { evento: EVENTO_ERROR_CACHE, error: 'Error' },
    ]);
  });
});

describe('ValidarItem (TR-RF-027, CatalogoPort)', () => {
  it('TR-CA-070: DNI es válido y devuelve longitud 8', async () => {
    const { validar } = await lectura();
    expect(await validar.validarItem('TIPO_DOC_IDENTIDAD', 'DNI')).toEqual({
      valido: true,
      motivo: null,
      atributos: { longitud: 8, regex: '^[0-9]{8}$' },
    });
  });

  it('TR-CA-071: Plin oculto por el tenant da OCULTO; para otro tenant sigue válido', async () => {
    const { actual, validar, plinId } = await lectura();
    await new AjustarItem(actual.dependencias).ejecutar({
      catalogo: 'MEDIO_PAGO',
      itemId: plinId,
      visible: false,
      orden: null,
      alias: null,
      version: null,
      actorId: ANA,
    });
    expect(await validar.validarItem('MEDIO_PAGO', 'PLIN')).toEqual({ valido: false, motivo: 'OCULTO', atributos: {} });
    actual.comoTenant(OTRA_CLINICA);
    expect(await validar.validarItem('MEDIO_PAGO', 'PLIN')).toMatchObject({ valido: true });
  });

  it('inactivo, fuera de vigencia y ausente dan INACTIVO, FUERA_DE_VIGENCIA e INEXISTENTE', async () => {
    const { actual, validar } = await lectura();
    const guardar = new GuardarItemPropio(actual.dependencias);
    await guardar.crear({ catalogo: 'MEDIO_PAGO', codigo: 'CHEQUE', ...contenido({ nombre: 'Cheque', activo: false }), actorId: ANA });
    await guardar.crear({ catalogo: 'MEDIO_PAGO', codigo: 'VALE', ...contenido({ nombre: 'Vale', vigenteHasta: '2026-06-30' }), actorId: ANA });

    expect(await validar.validarItem('MEDIO_PAGO', 'CHEQUE')).toMatchObject({ valido: false, motivo: 'INACTIVO' });
    expect(await validar.validarItem('MEDIO_PAGO', 'VALE')).toMatchObject({ valido: false, motivo: 'FUERA_DE_VIGENCIA' });
    expect(await validar.validarItem('MEDIO_PAGO', 'BITCOIN')).toEqual({ valido: false, motivo: 'INEXISTENTE', atributos: null });
  });

  it('un catálogo inexistente lanza CatalogoNoExisteError', async () => {
    const { validar } = await lectura();
    await expect(validar.validarItem('NO_EXISTE', 'X')).rejects.toThrow(CatalogoNoExisteError);
  });

  it('con Redis caído valida igual desde la base', async () => {
    const { validar, avisos } = await lectura(CAIDA);
    expect(await validar.validarItem('TIPO_DOC_IDENTIDAD', 'DNI')).toMatchObject({ valido: true });
    expect(avisos.length).toBeGreaterThan(0);
  });
});
