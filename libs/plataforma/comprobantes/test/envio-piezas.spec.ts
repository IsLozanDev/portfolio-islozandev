import type { ArchivoSistemaPort, GuardarArchivoComando } from '@vitrina/plataforma/archivos';
import { EncolarEnvioComprobante } from '../src/application/encolar-envio-comprobante.js';
import type { TrabajoEnvioFe } from '../src/application/ports/cola-envios-fe.js';
import { boletaDePrueba } from '../src/domain/documento-electronico.js';
import type { ComprobanteEmitidoEvento } from '../src/domain/eventos-fe.js';
import {
  ArchivosCpeArc,
  CATEGORIA_CPE,
  ENTIDAD_COMPROBANTE,
  EVENTO_ARCHIVO_NO_GUARDADO,
  INTENTOS_SUBIDA_ARC,
} from '../src/infrastructure/arc/archivos-cpe.arc.js';
import { ColaEnviosFeBullmq, INTENTOS_ENVIO_FE, NOMBRE_COLA_ENVIOS_FE } from '../src/infrastructure/bullmq/cola-envios.js';

const COMPROBANTE = '0193f3a0-0000-7000-8000-0000000000c1';
const EMISOR = { ruc: '20601234561', razonSocial: 'X SAC', nombreComercial: null, domicilioFiscal: 'AV. 1', ubigeo: '150122', codigoEstablecimiento: '0000' };
const documento = boletaDePrueba(EMISOR, 'B002', 125, new Date('2026-11-25T15:00:00Z'));

/** ARC que falla las primeras `fallos` veces. */
class ArchivoSistemaDoble implements ArchivoSistemaPort {
  readonly comandos: GuardarArchivoComando[] = [];
  constructor(private fallos = 0) {}

  guardar(comando: GuardarArchivoComando) {
    this.comandos.push(comando);
    if (this.fallos > 0) {
      this.fallos -= 1;
      return Promise.reject(new TypeError('Storage no responde: ruta/secreta'));
    }
    return Promise.resolve({ archivoId: `archivo-${this.comandos.length}`, hashSha256: 'h'.repeat(64), bytes: comando.bytes.byteLength });
  }
}

describe('ArchivosCpeArc (XML y CDR en TR-ARC)', () => {
  const avisos: { mensaje: string; datos: Record<string, unknown> }[] = [];
  const avisar = (mensaje: string, datos: Record<string, unknown>) => avisos.push({ mensaje, datos });
  beforeEach(() => (avisos.length = 0));

  it('guarda el XML y el CDR en CPE_XML, asociados al comprobante y con el nombre de SUNAT', async () => {
    const arc = new ArchivoSistemaDoble();
    const archivos = new ArchivosCpeArc(arc, avisar);

    expect(await archivos.guardarXml(COMPROBANTE, documento, new Uint8Array([1]))).toBe('archivo-1');
    expect(await archivos.guardarCdr(COMPROBANTE, documento, new Uint8Array([2]))).toBe('archivo-2');

    expect(arc.comandos.map(({ categoria, entidadTipo, entidadId, nombreOriginal, mime }) => ({ categoria, entidadTipo, entidadId, nombreOriginal, mime }))).toEqual([
      { categoria: CATEGORIA_CPE, entidadTipo: ENTIDAD_COMPROBANTE, entidadId: COMPROBANTE, nombreOriginal: '20601234561-03-B002-00000125.xml', mime: 'application/xml' },
      { categoria: CATEGORIA_CPE, entidadTipo: ENTIDAD_COMPROBANTE, entidadId: COMPROBANTE, nombreOriginal: 'R-20601234561-03-B002-00000125.zip', mime: 'application/zip' },
    ]);
  });

  it('reintenta en memoria: un fallo pasajero no pierde el archivo', async () => {
    const arc = new ArchivoSistemaDoble(INTENTOS_SUBIDA_ARC - 1);

    expect(await new ArchivosCpeArc(arc, avisar).guardarXml(COMPROBANTE, documento, new Uint8Array([1]))).toBe(`archivo-${INTENTOS_SUBIDA_ARC}`);
    expect(avisos).toEqual([]);
  });

  it('agotados los intentos devuelve null y avisa con solo el nombre del error', async () => {
    const arc = new ArchivoSistemaDoble(INTENTOS_SUBIDA_ARC);

    expect(await new ArchivosCpeArc(arc, avisar).guardarCdr(COMPROBANTE, documento, new Uint8Array([2]))).toBeNull();
    expect(arc.comandos).toHaveLength(INTENTOS_SUBIDA_ARC);
    expect(avisos).toEqual([
      { mensaje: EVENTO_ARCHIVO_NO_GUARDADO, datos: { comprobante_id: COMPROBANTE, archivo: 'CDR', intentos: INTENTOS_SUBIDA_ARC, error: 'TypeError' } },
    ]);
    expect(JSON.stringify(avisos)).not.toContain('ruta/secreta');
  });
});

describe('Cola fe-envios y encolado de cpe.emitido', () => {
  it('encola con jobId = comprobanteId, 3 intentos y backoff exponencial desde 5 s', async () => {
    const agregados: [string, TrabajoEnvioFe, object][] = [];
    const cola = new ColaEnviosFeBullmq({ add: (nombre, trabajo, opciones) => Promise.resolve(agregados.push([nombre, trabajo, opciones])) });
    const emitido: ComprobanteEmitidoEvento = {
      comprobante_id: COMPROBANTE,
      tipo: '03',
      serie: 'B002',
      numero: 125,
      total: '11.80',
      moneda: 'PEN',
      estado: 'PENDIENTE_ENVIO',
      origen_producto: null,
      origen_id: null,
    };

    await new EncolarEnvioComprobante(cola).ejecutar('tenant-a', emitido);

    expect(NOMBRE_COLA_ENVIOS_FE).toBe('fe-envios');
    expect(agregados).toEqual([
      [
        'enviar',
        { tenantId: 'tenant-a', comprobanteId: COMPROBANTE },
        { jobId: COMPROBANTE, attempts: INTENTOS_ENVIO_FE, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: true, removeOnFail: true },
      ],
    ]);
  });
});
