import { calcularDiferencias, fechaDeCierre, type ItemGlobalActual } from '../src/domain/importacion/calcular-diferencias.js';
import { DISENOS_TABLAS, validarCabecera } from '../src/domain/importacion/disenos-tablas.js';
import {
  ArchivoDemasiadoGrandeError,
  ArchivoInvalidoError,
  ColaNoDisponibleError,
  ColumnasInvalidasError,
  FilasInvalidasError,
  ImportacionEnCursoError,
  ImportacionNoAplicableError,
  ImportacionNoEncontradaError,
  TablaNoImportableError,
} from '../src/domain/importacion/errores.js';
import type { FilaImportada } from '../src/domain/importacion/fila-importada.js';
import { Importacion, type DatosArchivoImportado } from '../src/domain/importacion/importacion.js';
import { ERRORES_MAXIMOS_GUARDADOS, esTablaImportable, TABLAS_IMPORTABLES } from '../src/domain/importacion/tipos.js';
import { ValidacionArchivo } from '../src/domain/importacion/validacion-archivo.js';
import { validarFila } from '../src/domain/importacion/validar-fila.js';

const mensajeDe = (accion: () => unknown): string => {
  try {
    accion();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('no falló');
};

const FECHA = '2026-06-01';
const HORA = 3_600_000;

describe('errores de importación', () => {
  it.each([
    [new TablaNoImportableError(), 'TABLA_NO_IMPORTABLE', 'El catálogo no es una tabla oficial importable'],
    [new ArchivoInvalidoError('El archivo no está en UTF-8'), 'ARCHIVO_INVALIDO', 'El archivo no está en UTF-8'],
    [new ArchivoDemasiadoGrandeError(), 'ARCHIVO_DEMASIADO_GRANDE', 'El archivo supera los 20 MB'],
    [new FilasInvalidasError('id', [], 3), 'FILAS_INVALIDAS', 'El archivo tiene filas inválidas; no se importó nada'],
    [new ImportacionNoEncontradaError(), 'IMPORTACION_NO_ENCONTRADA', 'La importación no existe'],
    [new ImportacionEnCursoError(), 'IMPORTACION_EN_CURSO', 'Ya hay una importación en curso para este catálogo'],
    [new ColaNoDisponibleError(), 'COLA_NO_DISPONIBLE', 'No se pudo encolar la importación; intente de nuevo'],
  ])('%p', (error, codigo, mensaje) => {
    expect(error.code).toBe(codigo);
    expect(error.message).toBe(mensaje);
  });

  it('FILAS_INVALIDAS lleva la importación, los errores de la respuesta y el total', () => {
    const errores = [{ fila: 2, columna: 'codigo', valor: 'x', mensaje: 'Valor obligatorio' }];
    expect(new FilasInvalidasError('i-1', errores, 3_000)).toMatchObject({ importacionId: 'i-1', errores, totalErrores: 3_000 });
  });
});

describe('tablas importables', () => {
  it('son las 7 oficiales', () => {
    expect([...TABLAS_IMPORTABLES].sort()).toEqual(Object.keys(DISENOS_TABLAS).sort());
    expect(esTablaImportable('TIPO_COMPROBANTE')).toBe(true);
    expect(esTablaImportable('MEDIO_PAGO')).toBe(false);
  });
});

describe('cabecera', () => {
  it('TR-CA-073: CIE10 sin descripcion da «Falta la columna descripcion»', () => {
    expect(() => validarCabecera(DISENOS_TABLAS.CIE10, ['codigo'])).toThrow(ColumnasInvalidasError);
    expect(mensajeDe(() => validarCabecera(DISENOS_TABLAS.CIE10, ['codigo']))).toBe('Falta la columna descripcion');
  });

  it('ignora mayúsculas, espacios al borde y orden', () => {
    expect(() => validarCabecera(DISENOS_TABLAS.UBIGEO, [' Provincia', 'DESCRIPCION ', 'departamento', 'Codigo', 'orden'])).not.toThrow();
  });

  it('rechaza una columna desconocida y una repetida', () => {
    expect(mensajeDe(() => validarCabecera(DISENOS_TABLAS.MONEDA, ['codigo', 'descripcion', 'Pais']))).toBe('Columna desconocida: pais');
    expect(mensajeDe(() => validarCabecera(DISENOS_TABLAS.MONEDA, ['codigo', 'descripcion', 'CODIGO']))).toBe('Columna repetida: codigo');
  });

  it.each([
    ['UBIGEO', ['codigo', 'descripcion', 'departamento', 'provincia'], ['orden']],
    ['CIE10', ['codigo', 'descripcion'], ['orden']],
    ['TIPO_COMPROBANTE', ['codigo', 'descripcion'], ['abreviatura', 'orden']],
    ['UNIDAD_MEDIDA', ['codigo', 'descripcion'], ['abreviatura', 'orden']],
    ['TIPO_DOC_IDENTIDAD', ['codigo', 'codigo_externo', 'descripcion'], ['abreviatura', 'orden']],
    ['AFECTACION_IGV', ['codigo', 'descripcion'], ['orden']],
    ['MONEDA', ['codigo', 'descripcion'], ['codigo_externo', 'abreviatura', 'orden']],
  ] as const)('%s exige %j y admite %j', (tabla, obligatorias, opcionales) => {
    const diseno = DISENOS_TABLAS[tabla];
    expect(() => validarCabecera(diseno, [...obligatorias, ...opcionales])).not.toThrow();
    for (const obligatoria of obligatorias) {
      expect(mensajeDe(() => validarCabecera(diseno, obligatorias.filter((columna) => columna !== obligatoria)))).toBe(
        `Falta la columna ${obligatoria}`,
      );
    }
  });
});

describe('fila', () => {
  it.each([
    ['UBIGEO', '150101', '15010'],
    ['CIE10', 'A00.1', 'a00'],
    ['CIE10', 'J459', 'J4'],
    ['TIPO_COMPROBANTE', '01', '1'],
    ['UNIDAD_MEDIDA', 'NIU', 'KGMS'],
    ['TIPO_DOC_IDENTIDAD', 'DOC_A', 'doc-a'],
    ['AFECTACION_IGV', '10', '100'],
    ['MONEDA', 'PEN', 'PE'],
  ] as const)('%s acepta el código %s y rechaza %s', (tabla, valido, invalido) => {
    const diseno = DISENOS_TABLAS[tabla];
    const celdas = { descripcion: 'X', departamento: 'LIMA', provincia: 'LIMA', codigo_externo: '1' };
    expect(validarFila(diseno, 2, { ...celdas, codigo: valido }).valida).toBe(true);
    const resultado = validarFila(diseno, 2, { ...celdas, codigo: invalido });
    expect(resultado).toEqual({
      valida: false,
      errores: [{ fila: 2, columna: 'codigo', valor: invalido, mensaje: 'El código no tiene el formato de la tabla' }],
    });
  });

  it('normaliza la fila: descripcion a nombre, atributos del diseño y orden del archivo', () => {
    const resultado = validarFila(DISENOS_TABLAS.UBIGEO, 7, {
      ' Codigo ': ' 150101 ',
      DESCRIPCION: 'Lima',
      departamento: 'LIMA',
      provincia: 'LIMA',
      orden: '12',
    });
    expect(resultado).toEqual({
      valida: true,
      fila: {
        numero: 7,
        codigo: '150101',
        codigoExterno: null,
        nombre: 'Lima',
        abreviatura: null,
        orden: 12,
        atributos: { departamento: 'LIMA', provincia: 'LIMA' },
      },
    });
  });

  it('sin orden usa el número de fila', () => {
    const resultado = validarFila(DISENOS_TABLAS.MONEDA, 9, { codigo: 'USD', descripcion: 'Dólar', codigo_externo: '', abreviatura: 'US$' });
    expect(resultado.valida && resultado.fila).toMatchObject({ orden: 9, codigoExterno: null, abreviatura: 'US$' });
  });

  it('devuelve todos los errores de la fila y recorta el valor a 100 caracteres', () => {
    const largo = 'x'.repeat(250);
    const resultado = validarFila(DISENOS_TABLAS.TIPO_DOC_IDENTIDAD, 3, {
      codigo: 'DNI',
      codigo_externo: '',
      descripcion: largo,
      abreviatura: 'y'.repeat(31),
      orden: 'uno',
    });
    expect(resultado.valida).toBe(false);
    if (resultado.valida) return;
    expect(resultado.errores.map((error) => `${error.columna}:${error.mensaje}`)).toEqual([
      'codigo_externo:Valor obligatorio',
      'descripcion:La descripción debe tener de 1 a 200 caracteres',
      'abreviatura:La abreviatura debe tener como máximo 30 caracteres',
      'orden:El orden debe ser un número entero',
    ]);
    expect(resultado.errores[1]?.valor).toHaveLength(100);
  });

  it('rechaza un código externo largo, un orden fuera de rango y un atributo largo', () => {
    const resultado = validarFila(DISENOS_TABLAS.UBIGEO, 4, {
      codigo: '150101',
      descripcion: 'Lima',
      departamento: 'L'.repeat(201),
      provincia: 'LIMA',
      orden: '99999999999',
    });
    expect(resultado.valida ? [] : resultado.errores.map((error) => error.columna)).toEqual(['orden', 'departamento']);
    const moneda = validarFila(DISENOS_TABLAS.MONEDA, 5, { codigo: 'PEN', descripcion: 'Sol', codigo_externo: '9'.repeat(41) });
    expect(moneda.valida ? [] : moneda.errores.map((error) => error.columna)).toEqual(['codigo_externo']);
  });
});

describe('validación del archivo', () => {
  const celdasMoneda = (codigo: string): Record<string, string> => ({ codigo, descripcion: `Moneda ${codigo}` });

  it('no se detiene en el primer error y detecta un código repetido', () => {
    const validacion = new ValidacionArchivo(DISENOS_TABLAS.MONEDA);
    validacion.agregar(2, celdasMoneda('PEN'));
    validacion.agregar(3, celdasMoneda('pen'));
    validacion.agregar(4, celdasMoneda('USD'));
    validacion.agregar(5, celdasMoneda('PEN'));
    expect(validacion.filas.map((fila) => fila.codigo)).toEqual(['PEN', 'USD']);
    expect(validacion.tieneErrores).toBe(true);
    expect(validacion.errores).toEqual([
      { fila: 3, columna: 'codigo', valor: 'pen', mensaje: 'El código no tiene el formato de la tabla' },
      { fila: 5, columna: 'codigo', valor: 'PEN', mensaje: 'Código repetido; ya está en la fila 2' },
    ]);
  });

  it('guarda hasta 10 000 errores y cuenta el total real', () => {
    const validacion = new ValidacionArchivo(DISENOS_TABLAS.MONEDA);
    for (let fila = 2; fila < 12_002; fila++) validacion.agregar(fila, celdasMoneda('mal'));
    expect(validacion.errores).toHaveLength(ERRORES_MAXIMOS_GUARDADOS);
    expect(validacion.totalErrores).toBe(12_000);
  });

  it('sin errores no los marca', () => {
    const validacion = new ValidacionArchivo(DISENOS_TABLAS.MONEDA);
    validacion.agregar(2, celdasMoneda('PEN'));
    expect(validacion.tieneErrores).toBe(false);
    expect(validacion.totalErrores).toBe(0);
  });
});

const codigoUbigeo = (indice: number): string => String(150_100 + indice).padStart(6, '0');

const filaUbigeo = (codigo: string, numero: number): FilaImportada => ({
  numero,
  codigo,
  codigoExterno: null,
  nombre: `Distrito ${codigo}`,
  abreviatura: null,
  orden: numero,
  atributos: { departamento: 'LIMA', provincia: 'LIMA' },
});

const itemDe = (fila: FilaImportada, cambios: Partial<ItemGlobalActual> = {}): ItemGlobalActual => ({
  id: `id-${fila.codigo}`,
  codigo: fila.codigo,
  codigoExterno: fila.codigoExterno,
  nombre: fila.nombre,
  abreviatura: fila.abreviatura,
  orden: fila.orden,
  atributos: { ...fila.atributos },
  vigenteDesde: '2026-01-01',
  vigenteHasta: null,
  activo: true,
  ...cambios,
});

describe('diferencias', () => {
  it('TR-CA-072: UBIGEO de 1 874 a 1 892 distritos da 18 altas', () => {
    const archivo = Array.from({ length: 1_892 }, (_, indice) => filaUbigeo(codigoUbigeo(indice), indice + 2));
    const actuales = archivo.slice(0, 1_874).map((fila) => itemDe(fila));
    const diferencias = calcularDiferencias(archivo, actuales, FECHA);
    expect(diferencias.altas).toHaveLength(18);
    expect(diferencias.cambios).toHaveLength(0);
    expect(diferencias.bajas).toHaveLength(0);
    expect(diferencias.sinCambios).toBe(1_874);
  });

  it('TR-CA-074: el distrito 150199 ausente queda como baja que cierra el día anterior', () => {
    const vigente = filaUbigeo('150101', 2);
    const ausente = itemDe(filaUbigeo('150199', 3));
    const diferencias = calcularDiferencias([vigente], [itemDe(vigente), ausente], FECHA);
    expect(diferencias.bajas).toEqual([ausente]);
    expect(fechaDeCierre(ausente, FECHA)).toBe('2026-05-31');
  });

  it('el cierre no queda antes del inicio de vigencia', () => {
    expect(fechaDeCierre(itemDe(filaUbigeo('150101', 2), { vigenteDesde: FECHA }), FECHA)).toBe(FECHA);
    expect(fechaDeCierre(itemDe(filaUbigeo('150101', 2), { vigenteDesde: '2026-03-01' }), '2026-03-01')).toBe('2026-03-01');
  });

  it('los ítems ya cerrados no son baja; uno cerrado en el futuro sí', () => {
    const cerrado = itemDe(filaUbigeo('150102', 2), { vigenteHasta: '2026-05-31' });
    const cierraDespues = itemDe(filaUbigeo('150103', 3), { vigenteHasta: '2026-12-31' });
    expect(calcularDiferencias([], [cerrado, cierraDespues], FECHA).bajas).toEqual([cierraDespues]);
  });

  it.each([
    ['nombre', { nombre: 'Otro' }],
    ['código externo', { codigoExterno: '99' }],
    ['abreviatura', { abreviatura: 'AB' }],
    ['orden', { orden: 50 }],
    ['atributo del diseño', { atributos: { departamento: 'CUSCO', provincia: 'LIMA' } }],
    ['ítem cerrado', { vigenteHasta: '2026-03-01' }],
    ['ítem inactivo', { activo: false }],
  ])('un cambio de %s es cambio', (_, cambio) => {
    const fila = filaUbigeo('150101', 2);
    const actual = itemDe(fila, cambio);
    expect(calcularDiferencias([fila], [actual], FECHA).cambios).toEqual([{ antes: actual, despues: fila }]);
  });

  it('un atributo ajeno al diseño no es cambio', () => {
    const fila = filaUbigeo('150101', 2);
    const actual = itemDe(fila, { atributos: { departamento: 'LIMA', provincia: 'LIMA', longitud: 8 } });
    expect(calcularDiferencias([fila], [actual], FECHA)).toMatchObject({ cambios: [], sinCambios: 1 });
  });
});

const ANA = 'a0000000-0000-0000-0000-000000000901';
const CREADA = new Date('2026-06-01T10:00:00Z');

const datosArchivo = (): DatosArchivoImportado => ({
  id: 'i0000000-0000-0000-0000-000000000001',
  tenantId: 't0000000-0000-0000-0000-000000000001',
  catalogoId: 'c0000000-0000-0000-0000-000000000001',
  versionOficial: '2026-06',
  fechaVigencia: FECHA,
  archivoNombre: 'ubigeo.csv',
  archivoSha256: 'a'.repeat(64),
  versionCatalogo: 3,
  lanzadoPor: ANA,
  ahora: CREADA,
});

const previsualizada = (): Importacion => {
  const alta = filaUbigeo('150102', 3);
  const cambio = filaUbigeo('150101', 2);
  const baja = itemDe(filaUbigeo('150199', 4));
  return Importacion.previsualizar({
    ...datosArchivo(),
    diferencias: { altas: [alta], cambios: [{ antes: itemDe(cambio, { nombre: 'Antes' }), despues: cambio }], bajas: [baja], sinCambios: 5 },
  });
};

const enCola = (): Importacion => {
  const importacion = previsualizada();
  importacion.encolar(ANA, new Date(CREADA.getTime() + HORA));
  return importacion;
};

describe('Importacion', () => {
  it('previsualizar guarda el resumen y las operaciones con ids', () => {
    const importacion = previsualizada();
    expect(importacion.estado).toBe('PREVISUALIZADA');
    expect(importacion.version).toBe(0);
    expect(importacion.resumen).toEqual({ altas: 1, cambios: 1, bajas: 1, sinCambios: 5 });
    expect(importacion.operaciones?.cambios.map((cambio) => cambio.itemId)).toEqual(['id-150101']);
    expect(importacion.operaciones?.bajas).toEqual(['id-150199']);
    expect(importacion.venceEn).toEqual(new Date('2026-06-02T10:00:00Z'));
    expect(importacion.esFinal).toBe(false);
  });

  it('rechazar es final, sin operaciones y con los errores', () => {
    const errores = [{ fila: 2, columna: 'codigo', valor: 'x', mensaje: 'El código no tiene el formato de la tabla' }];
    const importacion = Importacion.rechazar({ ...datosArchivo(), errores, totalErrores: 3_000 });
    expect(importacion.estado).toBe('RECHAZADA');
    expect(importacion.operaciones).toBeNull();
    expect(importacion.resumen).toEqual({ altas: 0, cambios: 0, bajas: 0, sinCambios: 0 });
    expect(importacion.errores).toEqual(errores);
    expect(importacion.totalErrores).toBe(3_000);
    expect(importacion.esFinal).toBe(true);
    expect(() => importacion.encolar(ANA, CREADA)).toThrow(ImportacionNoAplicableError);
  });

  it('encolar antes de 24 h la deja EN_COLA con quien la aplica', () => {
    const importacion = previsualizada();
    const ahora = new Date(CREADA.getTime() + 23 * HORA);
    expect(importacion.encolar(ANA, ahora)).toBe(true);
    expect(importacion.estado).toBe('EN_COLA');
    expect(importacion.aplicadoPor).toBe(ANA);
    expect(importacion.encoladoEn).toEqual(ahora);
  });

  it('encolar a las 24 h la deja VENCIDA sin operaciones', () => {
    const importacion = previsualizada();
    expect(importacion.encolar(ANA, new Date(CREADA.getTime() + 24 * HORA))).toBe(false);
    expect(importacion.estado).toBe('VENCIDA');
    expect(importacion.operaciones).toBeNull();
    expect(importacion.esFinal).toBe(true);
  });

  it('encolar dos veces da IMPORTACION_NO_APLICABLE con el estado', () => {
    const importacion = enCola();
    expect(mensajeDe(() => importacion.encolar(ANA, CREADA))).toBe('La importación está en estado EN_COLA y no se puede aplicar');
  });

  it('devolver a PREVISUALIZADA limpia el encolado', () => {
    const importacion = enCola();
    importacion.devolverAPrevisualizada();
    expect(importacion.estado).toBe('PREVISUALIZADA');
    expect(importacion.aplicadoPor).toBeNull();
    expect(importacion.encoladoEn).toBeNull();
    expect(() => importacion.devolverAPrevisualizada()).toThrow(ImportacionNoAplicableError);
  });

  it('marcarFallida recorta el motivo a 300 y libera las operaciones', () => {
    const importacion = enCola();
    const ahora = new Date(CREADA.getTime() + 2 * HORA);
    importacion.marcarFallida('m'.repeat(400), ahora);
    expect(importacion.estado).toBe('FALLIDA');
    expect(importacion.motivoFallo).toHaveLength(300);
    expect(importacion.operaciones).toBeNull();
    expect(importacion.terminadoEn).toEqual(ahora);
    expect(() => importacion.marcarFallida('otra vez', ahora)).toThrow(ImportacionNoAplicableError);
  });

  it('marcarObsoleta solo desde EN_COLA', () => {
    const importacion = enCola();
    importacion.marcarObsoleta(CREADA);
    expect(importacion.estado).toBe('OBSOLETA');
    expect(importacion.motivoFallo).toBeNull();
    expect(() => previsualizada().marcarObsoleta(CREADA)).toThrow(ImportacionNoAplicableError);
  });

  it('revisarPerdida cuenta desde que se encoló, no desde que se previsualizó', () => {
    const encolada = new Date(CREADA.getTime() + 20 * HORA);
    const importacion = previsualizada();
    importacion.encolar(ANA, encolada);
    expect(importacion.revisarPerdida(new Date(encolada.getTime() + HORA))).toBe(false);
    expect(importacion.estado).toBe('EN_COLA');
    expect(importacion.revisarPerdida(new Date(encolada.getTime() + HORA + 1))).toBe(true);
    expect(importacion.estado).toBe('FALLIDA');
    expect(importacion.motivoFallo).toBe('Trabajo perdido en la cola');
    expect(previsualizada().revisarPerdida(new Date(CREADA.getTime() + 10 * HORA))).toBe(false);
  });

  it('vencer pasa PREVISUALIZADA y RECHAZADA a VENCIDA y libera los errores', () => {
    const previa = previsualizada();
    previa.vencer(CREADA);
    expect(previa.estado).toBe('VENCIDA');
    const rechazada = Importacion.rechazar({ ...datosArchivo(), errores: [], totalErrores: 1 });
    rechazada.vencer(CREADA);
    expect(rechazada.estado).toBe('VENCIDA');
    expect(rechazada.errores).toBeNull();
    expect(() => enCola().vencer(CREADA)).toThrow(ImportacionNoAplicableError);
  });

  it('reconstituir conserva la versión y los datos', () => {
    const original = enCola();
    const copia = Importacion.reconstituir(original.id, 4, {
      tenantId: original.tenantId,
      catalogoId: original.catalogoId,
      versionOficial: original.versionOficial,
      fechaVigencia: original.fechaVigencia,
      archivoNombre: original.archivoNombre,
      archivoSha256: original.archivoSha256,
      versionCatalogo: original.versionCatalogo,
      estado: original.estado,
      resumen: original.resumen,
      operaciones: original.operaciones,
      totalErrores: original.totalErrores,
      errores: null,
      motivoFallo: original.motivoFallo,
      lanzadoPor: original.lanzadoPor,
      creadoEn: original.creadoEn,
      encoladoEn: original.encoladoEn,
      aplicadoPor: original.aplicadoPor,
      terminadoEn: original.terminadoEn,
    });
    expect(copia.version).toBe(4);
    expect(copia.estado).toBe('EN_COLA');
    expect(copia.archivoNombre).toBe('ubigeo.csv');
  });
});
