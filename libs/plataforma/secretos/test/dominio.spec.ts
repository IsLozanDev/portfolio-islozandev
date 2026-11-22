import { randomBytes } from 'node:crypto';
import { inspect } from 'node:util';
import { NotFoundError } from '@vitrina/plataforma/kernel';
import { BYTES_CLAVE, ClavesMaestras } from '../src/domain/claves-maestras.js';
import { datosAsociadosClave, datosAsociadosSecreto } from '../src/domain/datos-asociados.js';
import {
  ClaveMaestraDesconocidaError,
  ClaveMaestraInvalidaError,
  SecretoNoEncontradoError,
  TipoSecretoInvalidoError,
  ValorSecretoInvalidoError,
} from '../src/domain/errores.js';
import { exigirTipoSecreto } from '../src/domain/tipo-secreto.js';
import { BYTES_MAXIMOS_VALOR, exigirValorSecreto } from '../src/domain/valor-secreto.js';

describe('TipoSecreto', () => {
  it.each(['fe.clave_certificado', 'pag.llave_privada', 'not.token_canal2', 'a.b'])('acepta %s', (tipo) => {
    expect(exigirTipoSecreto(tipo)).toBe(tipo);
  });

  it.each(['FE.clave', 'clave_certificado', 'fe.clave.certificado', 'fe.1clave', '1fe.clave', 'fe-x.clave', '', `fe.${'a'.repeat(58)}`])(
    'rechaza %p',
    (tipo) => {
      expect(() => exigirTipoSecreto(tipo)).toThrow(TipoSecretoInvalidoError);
    },
  );

  it('admite hasta 60 caracteres', () => {
    expect(exigirTipoSecreto(`fe.${'a'.repeat(57)}`)).toHaveLength(60);
  });
});

describe('valor del secreto', () => {
  it('acepta de 1 byte a 64 KiB', () => {
    expect(() => exigirValorSecreto(new Uint8Array(1))).not.toThrow();
    expect(() => exigirValorSecreto(new Uint8Array(BYTES_MAXIMOS_VALOR))).not.toThrow();
  });

  it('rechaza el vacío y el que pasa de 64 KiB', () => {
    expect(() => exigirValorSecreto(new Uint8Array(0))).toThrow(ValorSecretoInvalidoError);
    expect(() => exigirValorSecreto(new Uint8Array(BYTES_MAXIMOS_VALOR + 1))).toThrow(ValorSecretoInvalidoError);
  });
});

describe('ClavesMaestras', () => {
  const claveUno = randomBytes(BYTES_CLAVE);
  const claveDos = randomBytes(BYTES_CLAVE);

  it('da la activa y cada versión configurada', () => {
    const claves = ClavesMaestras.crear(
      new Map([
        [1, claveUno],
        [2, claveDos],
      ]),
      2,
    );

    expect(claves.activa).toBe(2);
    expect(claves.versiones).toEqual([1, 2]);
    expect(claves.claveActiva()).toBe(claveDos);
    expect(claves.clave(1)).toBe(claveUno);
  });

  it('una activa que no está en la lista es inválida', () => {
    expect(() => ClavesMaestras.crear(new Map([[1, claveUno]]), 2)).toThrow(ClaveMaestraInvalidaError);
  });

  it('una clave que no tiene 32 bytes es inválida', () => {
    expect(() => ClavesMaestras.crear(new Map([[1, randomBytes(31)]]), 1)).toThrow(ClaveMaestraInvalidaError);
    expect(() => ClavesMaestras.crear(new Map([[1, randomBytes(33)]]), 1)).toThrow(ClaveMaestraInvalidaError);
  });

  it.each([0, -1, 1.5, 32_768])('la versión %p es inválida', (version) => {
    expect(() => ClavesMaestras.crear(new Map([[version, claveUno]]), version)).toThrow(ClaveMaestraInvalidaError);
  });

  it('pedir una versión ausente da ClaveMaestraDesconocidaError con la versión y sin ninguna clave', () => {
    const claves = ClavesMaestras.crear(new Map([[2, claveDos]]), 2);

    const error = capturar(() => claves.clave(1));

    expect(error).toBeInstanceOf(ClaveMaestraDesconocidaError);
    expect(error).toMatchObject({ version: 1, code: 'CLAVE_MAESTRA_DESCONOCIDA' });
    expect(textoDe(error)).not.toContain(claveDos.toString('base64'));
  });

  it('ni JSON ni inspect muestran las claves', () => {
    const claves = ClavesMaestras.crear(new Map([[1, claveUno]]), 1);

    for (const texto of [JSON.stringify(claves), inspect(claves, { depth: 10, showHidden: true }), String(claves)]) {
      expect(texto).not.toContain(claveUno.toString('base64'));
      expect(texto).not.toContain(claveUno.toString('hex'));
      expect(texto).not.toMatch(/\d+, \d+, \d+/);
    }
  });

  it('copia la lista: cambiar el mapa original no la altera', () => {
    const mapa = new Map([[1, claveUno]]);
    const claves = ClavesMaestras.crear(mapa, 1);

    mapa.delete(1);

    expect(claves.clave(1)).toBe(claveUno);
  });
});

describe('datos asociados', () => {
  it('atan la clave al tenant y a la versión, y el secreto al tenant, al id y al tipo', () => {
    expect(datosAsociadosClave('t-1', 2)).toBe('sec.clave_tenant|t-1|2');
    expect(datosAsociadosSecreto('t-1', 's-1', 'fe.clave_certificado')).toBe('sec.secreto|t-1|s-1|fe.clave_certificado');
  });
});

describe('errores', () => {
  it('SecretoNoEncontradoError es un NotFoundError con su código', () => {
    const error = new SecretoNoEncontradoError();

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.code).toBe('SECRETO_NO_ENCONTRADO');
  });
});

function capturar(accion: () => unknown): unknown {
  try {
    accion();
  } catch (error) {
    return error;
  }
  throw new Error('debía fallar');
}

function textoDe(error: unknown): string {
  return `${String(error)} ${JSON.stringify(error)} ${inspect(error)}`;
}
