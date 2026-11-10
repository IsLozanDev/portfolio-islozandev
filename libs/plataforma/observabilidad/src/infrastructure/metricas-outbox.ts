import { metrics } from '@opentelemetry/api';
import type { LectorEstadoOutbox } from '@vitrina/plataforma/eventos';

const MEDIDOR = 'vitrina-outbox';

/**
 * Medidores observables del outbox (spec 21, TR-RNF-106). El SDK los lee en cada exportación de métricas;
 * sin SDK registrado el medidor es no-op y la base no se consulta.
 */
export function registrarMetricasOutbox(lector: LectorEstadoOutbox, avisar: (error: unknown) => void): void {
  const medidor = metrics.getMeter(MEDIDOR);
  const pendientes = medidor.createObservableGauge('vitrina_outbox_pendientes', { description: 'Eventos que el relay aún no leyó' });
  const fallidos = medidor.createObservableGauge('vitrina_outbox_fallidos', { description: 'Entregas en la cola de fallidos' });
  const edad = medidor.createObservableGauge('vitrina_outbox_edad_pendiente_seg', {
    description: 'Antigüedad del evento pendiente más antiguo',
    unit: 's',
  });

  medidor.addBatchObservableCallback(
    async (resultado) => {
      try {
        const estado = await lector.leer();
        resultado.observe(pendientes, estado.pendientes);
        resultado.observe(fallidos, estado.fallidos);
        resultado.observe(edad, estado.edadPendienteSeg);
      } catch (error) {
        // Sin observación la serie queda sin dato; una alerta por ausencia de datos lo detecta.
        avisar(error);
      }
    },
    [pendientes, fallidos, edad],
  );
}
