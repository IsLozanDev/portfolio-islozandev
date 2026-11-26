import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { resultadoDeCodigo } from '../src/infrastructure/pse/sunat/codigos-sunat.js';
import { leerCdr, zipDeLaRespuesta } from '../src/infrastructure/pse/sunat/lectura-cdr.js';
import { leerFault } from '../src/infrastructure/pse/sunat/lectura-fault.js';
import { armarSobreSendBill } from '../src/infrastructure/pse/sunat/sobre-send-bill.js';
import { CdrIlegibleError, comprimir, descomprimirCdr } from '../src/infrastructure/pse/sunat/zip-sunat.js';
import { consultasUbl } from './support/xpath-ubl.js';

const NOMBRE_ARCHIVO = '20601234561-01-F001-1';
const leerFixture = (nombre: string) => readFileSync(new URL(`./fixtures/sunat/${nombre}`, import.meta.url), 'utf8');

describe('armarSobreSendBill', () => {
  const sobre = armarSobreSendBill({ usuario: '20601234561MODDATOS', clave: 'clave<&>"', nombreArchivo: NOMBRE_ARCHIVO, zipBase64: 'UEsDBA==' });
  const { valor } = consultasUbl(sobre);

  it('lleva UsernameToken con PasswordText, fileName .zip y contentFile', () => {
    expect(valor('//*[local-name()="Username"]')).toBe('20601234561MODDATOS');
    expect(valor('//*[local-name()="Password"]/@Type')).toMatch(/#PasswordText$/);
    expect(valor('//*[local-name()="sendBill"]/fileName')).toBe(`${NOMBRE_ARCHIVO}.zip`);
    expect(valor('//*[local-name()="sendBill"]/contentFile')).toBe('UEsDBA==');
  });

  it('escapa la clave: el sobre sigue siendo XML válido y la devuelve intacta', () => {
    expect(valor('//*[local-name()="Password"]')).toBe('clave<&>"');
    expect(sobre).not.toContain('clave<&>');
  });
});

describe('zip-sunat', () => {
  it('comprime un único RUC-TIPO-SERIE-NUMERO.xml', () => {
    const entradas = unzipSync(comprimir(NOMBRE_ARCHIVO, strToU8('<Invoice/>')));
    expect(Object.keys(entradas)).toEqual([`${NOMBRE_ARCHIVO}.xml`]);
    expect(strFromU8(entradas[`${NOMBRE_ARCHIVO}.xml`])).toBe('<Invoice/>');
  });

  it('descomprime el R-….xml del CDR, ignorando carpetas y otros archivos', () => {
    const zip = zipSync({ 'dummy/': new Uint8Array(), [`R-${NOMBRE_ARCHIVO}.xml`]: strToU8('<cdr/>') });
    expect(descomprimirCdr(zip)).toBe('<cdr/>');
  });

  it('ZIP corrupto o sin R-….xml → CdrIlegibleError', () => {
    expect(() => descomprimirCdr(strToU8('no es zip'))).toThrow(CdrIlegibleError);
    expect(() => descomprimirCdr(zipSync({ 'otro.xml': strToU8('<x/>') }))).toThrow(CdrIlegibleError);
  });
});

describe('lectura del CDR', () => {
  it('aceptado: código 0, descripción y sin notas', () => {
    expect(leerCdr(leerFixture('cdr-aceptado.xml'))).toEqual({
      codigo: '0',
      descripcion: 'La Factura numero F001-1, ha sido aceptada',
      notas: [],
    });
  });

  it('con observaciones: las cbc:Note de la raíz', () => {
    const cdr = leerCdr(leerFixture('cdr-observaciones.xml'));
    expect(cdr.codigo).toBe('0');
    expect(cdr.notas).toEqual([
      '4252 - El dato ingresado como atributo @listName es incorrecto.',
      '4287 - El precio unitario ingresado no corresponde al valor esperado',
    ]);
  });

  it('XML sin ResponseCode o que no es XML → CdrIlegibleError', () => {
    expect(() => leerCdr('<ar:ApplicationResponse xmlns:ar="x"/>')).toThrow(CdrIlegibleError);
    expect(() => leerCdr('no es xml')).toThrow(CdrIlegibleError);
  });

  it('saca el ZIP del applicationResponse de sendBillResponse', () => {
    const zip = zipSync({ [`R-${NOMBRE_ARCHIVO}.xml`]: strToU8(leerFixture('cdr-aceptado.xml')) });
    const respuesta = `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>
      <br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${Buffer.from(zip).toString('base64')}</applicationResponse></br:sendBillResponse>
      </soap-env:Body></soap-env:Envelope>`;
    const leido = zipDeLaRespuesta(respuesta);
    expect(leido).toEqual(zip);
    expect(leerCdr(descomprimirCdr(leido as Uint8Array)).codigo).toBe('0');
    expect(zipDeLaRespuesta(leerFixture('fault-2335.xml'))).toBeNull();
  });
});

describe('lectura del fault', () => {
  it.each([
    ['fault-2335.xml', '2335', 'El documento electrónico ingresado ha sido alterado - Detalle: Incorrect reference digest value'],
    ['fault-0102.xml', '0102', 'Usuario o contraseña incorrectos'],
    ['fault-0109.xml', '0109', '0109'],
  ])('%s → código %s', (archivo, codigo, descripcion) => {
    expect(leerFault(leerFixture(archivo))).toEqual({ codigo, descripcion });
  });

  it('una respuesta sin Fault → null', () => {
    expect(leerFault(leerFixture('cdr-aceptado.xml'))).toBeNull();
    expect(leerFault('no es xml')).toBeNull();
  });
});

describe('resultadoDeCodigo', () => {
  it.each([
    ['0', false, 'ACEPTADO'],
    ['0', true, 'ACEPTADO_CON_OBSERVACIONES'],
    ['4252', false, 'ACEPTADO_CON_OBSERVACIONES'],
    ['2335', false, 'RECHAZADO'],
    ['3999', false, 'RECHAZADO'],
    ['0102', false, 'CREDENCIAL_INVALIDA'],
    ['0111', false, 'CREDENCIAL_INVALIDA'],
    ['0154', false, 'CREDENCIAL_INVALIDA'],
    ['0109', false, 'ERROR_TECNICO'],
    ['0100', false, 'ERROR_TECNICO'],
    ['1033', false, 'ERROR_TECNICO'],
    ['sin-codigo', false, 'ERROR_TECNICO'],
  ] as const)('%s (observaciones: %s) → %s', (codigo, conObservaciones, resultado) => {
    expect(resultadoDeCodigo(codigo, conObservaciones)).toBe(resultado);
  });
});
