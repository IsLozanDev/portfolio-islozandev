import type { Clock } from '@vitrina/plataforma/kernel';
import type { ArchivosAtascados } from './ports/archivos-atascados.js';
import type { ColaAnalisis } from './ports/cola-analisis.js';

export interface DependenciasReencolado {
  reloj: Clock;
  atascados: ArchivosAtascados;
  cola: ColaAnalisis;
}

export interface ResultadoReencolado {
  reencolados: number;
  /** Encolados que fallaron (Redis caído): salen otra vez en la siguiente corrida. */
  fallidos: number;
}

/** Tres intentos con espera exponencial caben muy por debajo: a los 15 minutos el trabajo ya agotó sus reintentos. */
const MINUTOS_HASTA_ATASCADO = 15;
const MILISEGUNDOS_POR_MINUTO = 60 * 1000;
const TAMANO_LOTE = 200;

/**
 * Barrido periódico del worker: reencola los análisis que llevan más de 15 minutos sin resolverse (antivirus
 * o Storage caídos hasta agotar los reintentos). Solo encola: no abre transacción ni cambia el archivo, que
 * sigue `EN_ANALISIS` hasta que `AnalizarArchivo` lo resuelva. Un lote por corrida: reencolar no saca la fila
 * de la lista, así que paginar devolvería el mismo lote. Si el trabajo sigue vivo, la cola no crea otro.
 */
export class ReencolarAnalisisAtascados {
  constructor(private readonly dependencias: DependenciasReencolado) {}

  async ejecutar(): Promise<ResultadoReencolado> {
    const { reloj, atascados, cola } = this.dependencias;
    const antes = new Date(reloj.now().getTime() - MINUTOS_HASTA_ATASCADO * MILISEGUNDOS_POR_MINUTO);
    const resultado: ResultadoReencolado = { reencolados: 0, fallidos: 0 };
    for (const trabajo of await atascados.listarEnAnalisisAntesDe(antes, TAMANO_LOTE)) {
      try {
        await cola.encolar(trabajo);
        resultado.reencolados += 1;
      } catch {
        resultado.fallidos += 1;
      }
    }
    return resultado;
  }
}
