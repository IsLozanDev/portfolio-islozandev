import { evaluarAptoFactura } from '../domain/apto-factura.js';
import type { EntradaCache } from '../domain/entrada-cache.js';
import type { FuenteRespuesta, RespuestaConsulta } from './ports/identidad.port.js';

export function respuestaDesdeEntrada(entrada: EntradaCache, fuente: FuenteRespuesta): RespuestaConsulta {
  const origen = { fuente, proveedor: entrada.fuente, consultadoEn: entrada.consultadoEn };
  if (entrada.tipo === 'DNI') return { tipo: 'DNI', datos: entrada.datos, ...origen };

  const aptitud = evaluarAptoFactura(entrada.datos);
  if (aptitud.apto) return { tipo: 'RUC', datos: entrada.datos, aptoFactura: true, ...origen };
  return { tipo: 'RUC', datos: entrada.datos, aptoFactura: false, motivoNoApto: aptitud.motivo, ...origen };
}
