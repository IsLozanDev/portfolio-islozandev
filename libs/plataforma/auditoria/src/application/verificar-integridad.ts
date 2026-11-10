import type { Clock, EventPublisher, IdGenerator, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { eventoIntegridadRota } from '../domain/eventos.js';
import {
  aVerificacion,
  estaRota,
  estaTruncada,
  LOTE_VERIFICACION,
  puntoDePartida,
  quedanFilas,
  resultadoInicial,
  resultadoTruncado,
  sumarTramo,
  type ModoVerificacion,
  type PuntoDeControl,
  type ResultadoVerificacion,
  type Verificacion,
} from '../domain/verificacion.js';
import type { RegistroVerificaciones } from './ports/registro-verificaciones.port.js';

export interface DependenciasVerificacion {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  ids: IdGenerator;
  reloj: Clock;
  eventos: EventPublisher;
  registro: RegistroVerificaciones;
  /** Log `error` de una rotura: tenant, número y motivo; nunca el contenido de las filas (TR-RNF-026). */
  avisarRotura: (datos: Record<string, unknown>) => void;
}

const SIN_FILAS = '0';

/**
 * Verifica la cadena de hash de un tenant con su RLS (TR-RN-028, TR-RNF-112). INCREMENTAL parte de la
 * última verificación OK; COMPLETA, desde el inicio. Guarda una fila por corrida y, si está rota, publica
 * aud.integridad.rota en la misma transacción. Un tenant sin filas no guarda nada (devuelve null).
 */
export class VerificarIntegridad {
  constructor(private readonly dependencias: DependenciasVerificacion) {}

  ejecutar(tenantId: string, modo: ModoVerificacion): Promise<Verificacion | null> {
    const { contexto, unidadDeTrabajo, registro, reloj } = this.dependencias;
    return contexto.run({ tenantId }, () =>
      unidadDeTrabajo.run(async () => {
        const iniciadaEn = reloj.now();
        const desde = puntoDePartida(modo, modo === 'INCREMENTAL' ? await registro.ultimaCorrecta() : null);
        const maximo = await registro.maximoNumero();
        const truncada = estaTruncada(maximo, desde);
        if (!truncada && maximo === SIN_FILAS) return null;

        const resultado = truncada ? resultadoTruncado(desde) : await this.recorrer(desde);
        const verificacion = aVerificacion(resultado, { id: this.dependencias.ids.next(), tenantId, modo, iniciadaEn, terminadaEn: reloj.now() });
        await registro.guardar(verificacion);
        if (estaRota(resultado)) await this.reportarRotura(verificacion);
        return verificacion;
      }),
    );
  }

  /** Tramos de LOTE_VERIFICACION filas hasta que no queden o aparezca una falla. */
  private async recorrer(desde: PuntoDeControl): Promise<ResultadoVerificacion> {
    let resultado = resultadoInicial(desde);
    for (;;) {
      const tramo = await this.dependencias.registro.verificarTramo(resultado.hasta, LOTE_VERIFICACION);
      resultado = sumarTramo(resultado, tramo);
      if (!quedanFilas(tramo, LOTE_VERIFICACION)) return resultado;
    }
  }

  private async reportarRotura(verificacion: Verificacion): Promise<void> {
    const { numeroRoto, motivo } = verificacion;
    if (numeroRoto === null || motivo === null) return;
    this.dependencias.avisarRotura({ evento: 'aud.integridad.rota', tenant_id: verificacion.tenantId, numero_roto: numeroRoto, motivo });
    await this.dependencias.eventos.publish(eventoIntegridadRota({ ...verificacion, numeroRoto, motivo }));
  }
}
