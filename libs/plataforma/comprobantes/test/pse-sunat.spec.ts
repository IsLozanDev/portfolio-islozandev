import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Clock } from '@vitrina/plataforma/kernel';
import type { ProveedorFe } from '../src/application/ports/proveedores-fe.js';
import type { CredencialesPse } from '../src/application/ports/pse-ose.port.js';
import { boletaDePrueba } from '../src/domain/documento-electronico.js';
import { emisorDePrueba } from '../src/domain/emisor-documento.js';
import { APERTURA_MS, CircuitBreaker, UMBRAL_FALLOS } from '../src/infrastructure/pse/circuit-breaker.js';
import { PseSunat, TIMEOUT_SUNAT_MS, type BuscarSoap } from '../src/infrastructure/pse/sunat/pse.sunat.js';
import { CLAVE_PFX, crearPfx, RUC_EMPRESA } from './support/certificados.js';
import { consultasUbl } from './support/xpath-ubl.js';

const AHORA = new Date('2026-11-25T15:00:00Z');
const URL_BETA = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const URL_PRODUCCION = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';
const CLAVE_SOL = 'clave-sol-secreta';
const NOMBRE_ARCHIVO = `${RUC_EMPRESA}-03-BP01-00000007`;
const SUNAT: ProveedorFe = {
  codigo: 'SUNAT',
  requiereCertificado: true,
  seriePrueba: 'BP01',
  dominiosPermitidos: ['e-beta.sunat.gob.pe', 'e-factura.sunat.gob.pe'],
  urlBeta: URL_BETA,
  urlProduccion: URL_PRODUCCION,
};
const pfx = crearPfx(AHORA);
const credenciales: CredencialesPse = {
  url: null,
  usuario: 'MODDATOS',
  token: CLAVE_SOL,
  ambiente: 'BETA',
  certificado: { pfx, clave: CLAVE_PFX },
};
const EMISOR = emisorDePrueba({ ruc: RUC_EMPRESA, razonSocial: 'EMPRESA SAC', nombreComercial: null, domicilioFiscal: 'AV. LIMA 123', ubigeo: '150101' });
const boleta = boletaDePrueba(EMISOR, 'BP01', 7, AHORA);
const leerFixture = (nombre: string) => readFileSync(new URL(`./fixtures/sunat/${nombre}`, import.meta.url), 'utf8');

function respuestaSendBill(cdr: string): string {
  const zip = zipSync({ [`R-${NOMBRE_ARCHIVO}.xml`]: strToU8(cdr) });
  return `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>
    <br:sendBillResponse xmlns:br="http://service.sunat.gob.pe"><applicationResponse>${Buffer.from(zip).toString('base64')}</applicationResponse></br:sendBillResponse>
    </soap-env:Body></soap-env:Envelope>`;
}

const respuestaHttp = (status: number, cuerpo: string): ReturnType<BuscarSoap> => Promise.resolve({ status, text: () => Promise.resolve(cuerpo) });

class RelojManual implements Clock {
  instante = new Date(AHORA);
  now(): Date {
    return new Date(this.instante);
  }
}

describe('PseSunat (sendBill con respuestas grabadas)', () => {
  let reloj: RelojManual;
  let proveedor: ProveedorFe;
  let llamadas: { url: string; opciones: RequestInit }[];
  let registros: Record<string, unknown>[];
  let siguiente: () => ReturnType<BuscarSoap>;
  let adaptador: PseSunat;

  beforeEach(() => {
    reloj = new RelojManual();
    proveedor = { ...SUNAT };
    llamadas = [];
    registros = [];
    siguiente = () => respuestaHttp(200, respuestaSendBill(leerFixture('cdr-aceptado.xml')));
    adaptador = new PseSunat(
      { obtener: () => Promise.resolve(proveedor) },
      new CircuitBreaker(reloj),
      (mensaje, datos) => registros.push({ mensaje, ...datos }),
      (url, opciones) => {
        llamadas.push({ url, opciones });
        return siguiente();
      },
    );
  });

  it('aceptado → ACEPTADO con el ZIP del CDR, el XML firmado y el hash', async () => {
    const respuesta = await adaptador.enviarComprobante(credenciales, boleta);
    expect(respuesta).toMatchObject({ resultado: 'ACEPTADO', codigo: '0', descripcion: 'La Factura numero F001-1, ha sido aceptada', observaciones: [] });
    expect(Object.keys(unzipSync(respuesta.cdr as Uint8Array))).toEqual([`R-${NOMBRE_ARCHIVO}.xml`]);
    expect(strFromU8(respuesta.xmlFirmado as Uint8Array)).toContain('<ds:Signature');
    expect(respuesta.hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('POST SOAP a url_beta con SOAPAction, timeout de 15 s, sin redirecciones; Username = RUC + usuario y un único XML firmado', async () => {
    await adaptador.enviarComprobante(credenciales, boleta);
    const [{ url, opciones }] = llamadas;
    expect(url).toBe(URL_BETA);
    expect(opciones).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'urn:sendBill' }, redirect: 'error' });
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    expect(TIMEOUT_SUNAT_MS).toBe(15_000);

    const { valor } = consultasUbl(String(opciones.body));
    expect(valor('//*[local-name()="Username"]')).toBe(`${RUC_EMPRESA}MODDATOS`);
    expect(valor('//*[local-name()="Password"]')).toBe(CLAVE_SOL);
    expect(valor('//*[local-name()="sendBill"]/fileName')).toBe(`${NOMBRE_ARCHIVO}.zip`);
    const entradas = unzipSync(Buffer.from(valor('//*[local-name()="sendBill"]/contentFile') ?? '', 'base64'));
    expect(Object.keys(entradas)).toEqual([`${NOMBRE_ARCHIVO}.xml`]);
    expect(strFromU8(entradas[`${NOMBRE_ARCHIVO}.xml`])).toContain('<ds:Signature');
  });

  it('con ambiente PRODUCCION usa url_produccion', async () => {
    await adaptador.enviarComprobante({ ...credenciales, ambiente: 'PRODUCCION' }, boleta);
    expect(llamadas[0].url).toBe(URL_PRODUCCION);
  });

  it('host fuera de dominios_permitidos o sin URL en el ítem: no llama y es configuración (CREDENCIAL_INVALIDA)', async () => {
    proveedor = { ...SUNAT, urlBeta: 'https://evil.example.com/billService' };
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'CREDENCIAL_INVALIDA', codigo: 'URL_NO_PERMITIDA' });
    proveedor = { ...SUNAT, urlBeta: null };
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'CREDENCIAL_INVALIDA', codigo: 'URL_NO_PERMITIDA' });
    expect(llamadas).toHaveLength(0);
  });

  it('sin usuario SOL, sin certificado o con la clave del .pfx mala: no llama y es configuración (CREDENCIAL_INVALIDA)', async () => {
    expect(await adaptador.enviarComprobante({ ...credenciales, usuario: null }, boleta)).toMatchObject({
      resultado: 'CREDENCIAL_INVALIDA',
      codigo: 'SIN_USUARIO_SOL',
    });
    expect(await adaptador.enviarComprobante({ ...credenciales, certificado: undefined }, boleta)).toMatchObject({
      resultado: 'CREDENCIAL_INVALIDA',
      codigo: 'SIN_CERTIFICADO',
    });
    expect(await adaptador.enviarComprobante({ ...credenciales, certificado: { pfx, clave: 'otra' } }, boleta)).toMatchObject({
      resultado: 'CREDENCIAL_INVALIDA',
      codigo: 'FIRMA_FALLIDA',
    });
    expect(llamadas).toHaveLength(0);
  });

  it('CDR con notas → ACEPTADO_CON_OBSERVACIONES con las notas', async () => {
    siguiente = () => respuestaHttp(200, respuestaSendBill(leerFixture('cdr-observaciones.xml')));
    const respuesta = await adaptador.enviarComprobante(credenciales, boleta);
    expect(respuesta.resultado).toBe('ACEPTADO_CON_OBSERVACIONES');
    expect(respuesta.observaciones).toHaveLength(2);
  });

  it('fault 2335 (HTTP 500) → RECHAZADO con código y descripción, y con el XML firmado; credencial SOL inválida → CREDENCIAL_INVALIDA', async () => {
    siguiente = () => respuestaHttp(500, leerFixture('fault-2335.xml'));
    const rechazo = await adaptador.enviarComprobante(credenciales, boleta);
    expect(rechazo).toMatchObject({ resultado: 'RECHAZADO', codigo: '2335', descripcion: expect.stringContaining('alterado') });
    expect(rechazo.xmlFirmado).toBeInstanceOf(Uint8Array);
    expect(rechazo.cdr).toBeUndefined();
    siguiente = () => respuestaHttp(500, leerFixture('fault-0102.xml'));
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'CREDENCIAL_INVALIDA', codigo: '0102' });
  });

  it('0109, 5xx sin fault, cuerpo ilegible, timeout y red caída → ERROR_TECNICO', async () => {
    const casos: [() => ReturnType<BuscarSoap>, string][] = [
      [() => respuestaHttp(500, leerFixture('fault-0109.xml')), '0109'],
      [() => respuestaHttp(503, '<html>no disponible</html>'), 'HTTP_503'],
      [() => respuestaHttp(200, 'no es xml'), 'RESPUESTA_INVALIDA'],
      [() => respuestaHttp(200, respuestaSendBill('<roto/>')), 'RESPUESTA_INVALIDA'],
      [() => Promise.reject(new DOMException('tiempo', 'TimeoutError')), 'TIEMPO_AGOTADO'],
      [() => Promise.reject(new TypeError('fetch failed')), 'RED'],
    ];
    for (const [respuesta, codigo] of casos) {
      siguiente = respuesta;
      expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ERROR_TECNICO', codigo });
      reloj.instante = new Date(reloj.instante.getTime() + APERTURA_MS);
    }
  });

  it(`circuito: ${UMBRAL_FALLOS} fallos técnicos lo abren y no llama; un rechazo no cuenta como fallo`, async () => {
    siguiente = () => respuestaHttp(500, leerFixture('fault-2335.xml'));
    for (let envio = 0; envio < UMBRAL_FALLOS; envio += 1) await adaptador.enviarComprobante(credenciales, boleta);
    siguiente = () => respuestaHttp(503, '');
    for (let fallo = 0; fallo < UMBRAL_FALLOS; fallo += 1) await adaptador.enviarComprobante(credenciales, boleta);
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ERROR_TECNICO', codigo: 'CIRCUITO_ABIERTO' });
    expect(llamadas).toHaveLength(2 * UMBRAL_FALLOS);

    reloj.instante = new Date(reloj.instante.getTime() + APERTURA_MS);
    siguiente = () => respuestaHttp(200, respuestaSendBill(leerFixture('cdr-aceptado.xml')));
    expect(await adaptador.enviarComprobante(credenciales, boleta)).toMatchObject({ resultado: 'ACEPTADO' });
  });

  it('el log lleva RUC, comprobante, código y resultado; ni la clave SOL, ni el .pfx, ni el sobre', async () => {
    const respuesta = await adaptador.enviarComprobante(credenciales, boleta);
    expect(registros).toEqual([{ mensaje: 'Envío a SUNAT', ruc_emisor: RUC_EMPRESA, comprobante: '03-BP01-00000007', codigo: '0', resultado: 'ACEPTADO' }]);
    const textos = { codigo: respuesta.codigo, descripcion: respuesta.descripcion, observaciones: respuesta.observaciones };
    expect(JSON.stringify([registros, textos])).not.toMatch(new RegExp(`${CLAVE_SOL}|${CLAVE_PFX}|MODDATOS|Envelope`));
  });
});
