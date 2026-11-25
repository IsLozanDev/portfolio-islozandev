import type { Adquirente } from '../domain/comprobante/adquirente.js';
import { Decimal, ESCALA_UNITARIO, monto } from '../domain/comprobante/dinero.js';
import { huellaDeSolicitud } from '../domain/comprobante/huella-solicitud.js';
import type { Cuota } from '../domain/comprobante/reglas-factura.js';
import { MODO_ENVIO_POR_DEFECTO, type ModoEnvio } from '../domain/comprobante/tipo-comprobante.js';
import { DatosComprobanteInvalidosError } from '../domain/errores.js';
import type { EmitirComprobanteComando, LineaComando } from './ports/comprobante.port.js';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface LineaSolicitada {
  codigo: string | null;
  descripcion: string;
  unidad: string;
  cantidad: Decimal;
  valorUnitario: Decimal;
  afectacionIgv: string;
}

/** El comando con sus montos ya parseados y los opcionales resueltos; `huella` identifica su contenido. */
export interface SolicitudEmision {
  comando: EmitirComprobanteComando;
  cuotas: Cuota[];
  adquirente: Adquirente | null;
  lineas: LineaSolicitada[];
  totalEsperado: Decimal | null;
  modoEnvio: ModoEnvio;
  huella: string;
}

function exigirFecha(texto: string, campo: string): string {
  const valida = FECHA_ISO.test(texto) && new Date(`${texto}T00:00:00Z`).toISOString().startsWith(texto);
  if (!valida) throw new DatosComprobanteInvalidosError(`${campo}: «${texto}» no es una fecha YYYY-MM-DD`);
  return texto;
}

function lineaSolicitada(linea: LineaComando, indice: number): LineaSolicitada {
  const campo = `lineas.${indice}`;
  return {
    codigo: linea.codigo ?? null,
    descripcion: linea.descripcion,
    unidad: linea.unidad,
    cantidad: Decimal.desdeTexto(linea.cantidad, ESCALA_UNITARIO, `${campo}.cantidad`),
    valorUnitario: Decimal.desdeTexto(linea.valorUnitario, ESCALA_UNITARIO, `${campo}.valorUnitario`),
    afectacionIgv: linea.afectacionIgv,
  };
}

function adquirenteSolicitado(comando: EmitirComprobanteComando): Adquirente | null {
  const { adquirente } = comando;
  if (!adquirente) return null;
  return {
    tipoDocumento: adquirente.tipoDocumento,
    numero: adquirente.numero.trim(),
    nombre: adquirente.nombre.trim(),
    correo: adquirente.correo ?? null,
    personaId: adquirente.personaId ?? null,
  };
}

/** Montos con su escala y opcionales en null: «100» y «100.00» dan la misma huella. */
function huellaDe(comando: EmitirComprobanteComando, solicitud: Omit<SolicitudEmision, 'huella' | 'comando'>): string {
  return huellaDeSolicitud({
    tipo: comando.tipo,
    empresaId: comando.empresaId,
    sucursalId: comando.sucursalId,
    serie: comando.serie ?? null,
    moneda: comando.moneda,
    formaPago: comando.formaPago,
    cuotas: solicitud.cuotas.map((cuota) => ({ monto: cuota.monto.aTexto(), fechaVencimiento: cuota.fechaVencimiento })),
    adquirente: solicitud.adquirente && { ...solicitud.adquirente },
    lineas: solicitud.lineas.map((linea) => ({
      ...linea,
      cantidad: linea.cantidad.aTexto(),
      valorUnitario: linea.valorUnitario.aTexto(),
    })),
    totalEsperado: solicitud.totalEsperado?.aTexto() ?? null,
    modoEnvio: solicitud.modoEnvio,
    origen: comando.origen ? { ...comando.origen } : null,
  });
}

/** DatosComprobanteInvalidosError (400) si un monto o una fecha no tienen formato. */
export function normalizarSolicitud(comando: EmitirComprobanteComando): SolicitudEmision {
  const partes = {
    cuotas: (comando.cuotas ?? []).map((cuota, indice) => ({
      numero: indice + 1,
      monto: monto(cuota.monto, `cuotas.${indice}.monto`),
      fechaVencimiento: exigirFecha(cuota.fechaVencimiento, `cuotas.${indice}.fechaVencimiento`),
    })),
    adquirente: adquirenteSolicitado(comando),
    lineas: comando.lineas.map(lineaSolicitada),
    totalEsperado: comando.totalEsperado === undefined ? null : monto(comando.totalEsperado, 'totalEsperado'),
    modoEnvio: comando.modoEnvio ?? MODO_ENVIO_POR_DEFECTO,
  };
  return { comando, ...partes, huella: huellaDe(comando, partes) };
}
