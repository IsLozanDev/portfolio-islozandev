import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import type { ProveedorFe } from '../src/application/ports/proveedores-fe.js';
import type { CredencialesPse } from '../src/application/ports/pse-ose.port.js';
import { CLIENTES_VARIOS } from '../src/domain/comprobante/adquirente.js';
import { documentoDesdeComprobante } from '../src/domain/comprobante/documento-desde-comprobante.js';
import { CircuitBreaker } from '../src/infrastructure/pse/circuit-breaker.js';
import { PseSunat } from '../src/infrastructure/pse/sunat/pse.sunat.js';
import { comprobante, EMPRESA, ESTABLECIMIENTO, linea } from './support/comprobante-de-prueba.js';

/**
 * Humo manual contra la beta real de SUNAT (spec 51c), fuera del CI. Se salta salvo con `FE_HUMO_SUNAT_BETA=1`.
 * El RUC, la ruta del .pfx y su clave vienen de variables de entorno locales y no van en el repo:
 * `FE_HUMO_RUC`, `FE_HUMO_PFX` y `FE_HUMO_PFX_CLAVE`. El usuario y la clave son los públicos de la beta.
 */
const ACTIVO = process.env['FE_HUMO_SUNAT_BETA'] === '1';
const describirHumo = ACTIVO ? describe : describe.skip;

const USUARIO_BETA = 'MODDATOS';
const CLAVE_BETA = 'moddatos';
const URL_BETA = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const TIMEOUT_HUMO_MS = 60_000;
/** Un correlativo distinto por corrida: la beta responde 1033 a un número ya registrado. */
const NUMERO_POR_CORRIDA = Math.floor(Date.now() / 1000) % 10_000_000;

const SUNAT_BETA: ProveedorFe = {
  codigo: 'SUNAT',
  requiereCertificado: true,
  seriePrueba: 'BP01',
  dominiosPermitidos: ['e-beta.sunat.gob.pe'],
  urlBeta: URL_BETA,
  urlProduccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
};

const fechaDeHoyEnLima = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

describirHumo('SUNAT beta real (humo, FE_HUMO_SUNAT_BETA=1)', () => {
  const empresa = { ...EMPRESA, ruc: ACTIVO ? variable('FE_HUMO_RUC') : EMPRESA.ruc };
  const credenciales = (): CredencialesPse => ({
    url: null,
    usuario: USUARIO_BETA,
    token: CLAVE_BETA,
    ambiente: 'BETA',
    certificado: { pfx: Uint8Array.from(readFileSync(variable('FE_HUMO_PFX'))), clave: variable('FE_HUMO_PFX_CLAVE') },
  });
  const registros: Record<string, unknown>[] = [];
  const adaptador = new PseSunat(
    { obtener: () => Promise.resolve(SUNAT_BETA) },
    new CircuitBreaker({ now: () => new Date() }),
    (mensaje, datos) => registros.push({ mensaje, ...datos }),
  );
  const emision = { fechaEmision: fechaDeHoyEnLima(), creadoEn: new Date() };

  it.each([
    ['factura F001', () => documentoDesdeComprobante(comprobante(emision, NUMERO_POR_CORRIDA), empresa, ESTABLECIMIENTO, '6')],
    [
      'boleta B001',
      () =>
        documentoDesdeComprobante(
          comprobante({ ...emision, tipo: 'BOLETA', serie: 'B001', adquirente: CLIENTES_VARIOS, lineas: [linea('2', '10')] }, NUMERO_POR_CORRIDA),
          empresa,
          ESTABLECIMIENTO,
          '0',
        ),
    ],
  ])(
    '%s aceptada por la beta con CDR',
    async (_caso, documento) => {
      const respuesta = await adaptador.enviarComprobante(credenciales(), documento());
      console.info({ resultado: respuesta.resultado, codigo: respuesta.codigo, descripcion: respuesta.descripcion, observaciones: respuesta.observaciones });
      expect(['ACEPTADO', 'ACEPTADO_CON_OBSERVACIONES']).toContain(respuesta.resultado);
      // El ZIP de SUNAT trae una carpeta `dummy/` además del R-….xml.
      expect(Object.keys(unzipSync(respuesta.cdr as Uint8Array))).toContainEqual(expect.stringMatching(/^R-\d{11}-0[13]-/));
      expect(strFromU8(respuesta.xmlFirmado as Uint8Array)).toContain('<ds:Signature');
    },
    TIMEOUT_HUMO_MS,
  );
});
