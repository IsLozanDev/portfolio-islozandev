import type { TonoEstado } from '@vitrina/shared/ui';
import type { EventoSeguridad, EventoSeguridadDetalle, TipoEvento } from '../models/evento-seguridad';
import {
  ETIQUETAS_ALCANCE_BLOQUEO,
  ETIQUETAS_ETAPA_INGRESO,
  ETIQUETAS_METODO_INGRESO,
  ETIQUETAS_MOTIVO_FALLO,
  ETIQUETAS_NIVEL_AUTENTICACION,
  ETIQUETAS_TIPO_EVENTO,
  MENSAJES_BITACORA,
  MOTIVOS_DE_BLOQUEO,
} from '../models/mensajes-bitacora';
import { formatearFecha, formatearFechaHora } from './formato';

/** Una línea legible del detalle; `tono` la muestra como chip (el motivo de un bloqueo). */
export interface DatoLegible {
  clave: string;
  etiqueta: string;
  valor: string;
  tono: TonoEstado | null;
}

const TONO_BLOQUEO: TonoEstado = 'advertencia';
const TIPOS_DE_INGRESO: readonly TipoEvento[] = ['LOGIN', 'LOGIN_FALLIDO'];

/** El resumen de la lista con etiquetas: método del ingreso, motivo del fallo o filas exportadas (spec 18b). */
export function resumenLegible(evento: Pick<EventoSeguridad, 'tipo' | 'resumen'>): string | null {
  const { tipo, resumen } = evento;
  if (resumen === null) return null;
  if (tipo === 'LOGIN') return ETIQUETAS_METODO_INGRESO[resumen] ?? resumen;
  if (tipo === 'LOGIN_FALLIDO') return ETIQUETAS_MOTIVO_FALLO[resumen] ?? resumen;
  if (tipo === 'EXPORTACION') return `${resumen} ${MENSAJES_BITACORA.filasExportadas.toLowerCase()}`;
  return resumen;
}

/** Título de la sección legible, o null si el tipo no la tiene. */
export function tituloDatosLegibles(tipo: TipoEvento): string | null {
  if (TIPOS_DE_INGRESO.includes(tipo)) return MENSAJES_BITACORA.datosDelIngreso;
  return tipo === 'EXPORTACION' ? MENSAJES_BITACORA.datosDeLaExportacion : null;
}

/** Datos de LOGIN, LOGIN_FALLIDO y EXPORTACION con etiquetas; para el resto, ninguno (quedan los datos crudos). */
export function datosLegibles(evento: EventoSeguridadDetalle): DatoLegible[] {
  const detalle = evento.detalle;
  if (evento.tipo === 'LOGIN') return datosDeLogin(detalle);
  if (evento.tipo === 'LOGIN_FALLIDO') return datosDeFallo(detalle);
  if (evento.tipo === 'EXPORTACION') return datosDeExportacion(detalle);
  return [];
}

function datosDeLogin(detalle: Readonly<Record<string, unknown>>): DatoLegible[] {
  return presentes([
    dato('metodo', MENSAJES_BITACORA.metodo, etiquetaDe(ETIQUETAS_METODO_INGRESO, detalle['metodo'])),
    dato('aal', MENSAJES_BITACORA.aal, etiquetaDe(ETIQUETAS_NIVEL_AUTENTICACION, detalle['aal'])),
    dato('agente', MENSAJES_BITACORA.navegador, texto(detalle['agente'])),
  ]);
}

function datosDeFallo(detalle: Readonly<Record<string, unknown>>): DatoLegible[] {
  const motivo = texto(detalle['motivo']);
  const esBloqueo = motivo !== null && MOTIVOS_DE_BLOQUEO.includes(motivo);
  return presentes([
    dato('etapa', MENSAJES_BITACORA.etapa, etiquetaDe(ETIQUETAS_ETAPA_INGRESO, detalle['etapa'])),
    // El motivo va siempre, aunque falte en el detalle (pedido del usuario en el spec 18b).
    { clave: 'motivo', etiqueta: MENSAJES_BITACORA.motivo, valor: etiquetaDe(ETIQUETAS_MOTIVO_FALLO, motivo) ?? MENSAJES_BITACORA.sinDato, tono: esBloqueo ? TONO_BLOQUEO : null },
    dato('alcance', MENSAJES_BITACORA.alcanceBloqueo, etiquetaDe(ETIQUETAS_ALCANCE_BLOQUEO, detalle['alcance'])),
    dato('hasta', MENSAJES_BITACORA.bloqueadoHasta, fechaHora(detalle['hasta'])),
    dato('correo', MENSAJES_BITACORA.correoIntentado, texto(detalle['correo'])),
    dato('agente', MENSAJES_BITACORA.navegador, texto(detalle['agente'])),
  ]);
}

function datosDeExportacion(detalle: Readonly<Record<string, unknown>>): DatoLegible[] {
  const filtros = (typeof detalle['filtros'] === 'object' && detalle['filtros'] !== null ? detalle['filtros'] : {}) as Record<string, unknown>;
  const desde = texto(filtros['desde']);
  const hasta = texto(filtros['hasta']);
  return presentes([
    dato('rango', MENSAJES_BITACORA.rangoExportado, desde && hasta ? `${formatearFecha(desde)} – ${formatearFecha(hasta)}` : null),
    dato('filtros', MENSAJES_BITACORA.filtrosExportados, filtrosLegibles(filtros)),
    dato('filas', MENSAJES_BITACORA.filasExportadas, typeof detalle['filas'] === 'number' ? String(detalle['filas']) : null),
  ]);
}

function filtrosLegibles(filtros: Readonly<Record<string, unknown>>): string {
  const tipo = texto(filtros['tipo']);
  const usuario = texto(filtros['usuario']);
  const partes = [
    tipo ? `${MENSAJES_BITACORA.tipo}: ${ETIQUETAS_TIPO_EVENTO[tipo as TipoEvento] ?? tipo}` : null,
    usuario ? `${MENSAJES_BITACORA.usuario}: ${usuario}` : null,
  ].filter((parte): parte is string => parte !== null);
  return partes.length > 0 ? partes.join(' · ') : MENSAJES_BITACORA.sinFiltros;
}

function dato(clave: string, etiqueta: string, valor: string | null): DatoLegible | null {
  return valor === null ? null : { clave, etiqueta, valor, tono: null };
}

function presentes(datos: (DatoLegible | null)[]): DatoLegible[] {
  return datos.filter((dato): dato is DatoLegible => dato !== null);
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

function etiquetaDe(etiquetas: Readonly<Record<string, string>>, valor: unknown): string | null {
  const codigo = texto(valor);
  return codigo === null ? null : (etiquetas[codigo] ?? codigo);
}

function fechaHora(valor: unknown): string | null {
  const iso = texto(valor);
  if (iso === null) return null;
  const instante = new Date(iso);
  return Number.isNaN(instante.getTime()) ? iso : formatearFechaHora(instante);
}
