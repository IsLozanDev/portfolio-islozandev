import { Module, type DynamicModule } from '@nestjs/common';
import { ARCHIVO_PORT } from '@vitrina/plataforma/archivos';
import { CATALOGO_PORT } from '@vitrina/plataforma/catalogos';
import { IDENTIDAD } from '@vitrina/plataforma/identidad';
import { PersonasModule } from '@vitrina/plataforma/personas';

/** Lo lanza cualquier caso de uso de personas que el worker no usa (solo lee personas y consentimientos). */
export class PuertoNoDisponibleEnWorkerError extends Error {
  override readonly name = 'PuertoNoDisponibleEnWorkerError';

  constructor() {
    super('Este puerto no está disponible en el worker: solo se leen personas y consentimientos');
  }
}

const noDisponible = (): never => {
  throw new PuertoNoDisponibleEnWorkerError();
};
const rechazar = (): Promise<never> => Promise.reject(new PuertoNoDisponibleEnWorkerError());

/**
 * Catálogos, identidad y archivos que PersonasModule inyecta: ObtenerPersona y la consulta de consentimientos, lo
 * único que el worker usa (la ejecución de una programación llama a `enviar`, spec 45), no los necesitan.
 */
@Module({
  providers: [
    { provide: CATALOGO_PORT, useValue: { validarItem: rechazar } },
    { provide: IDENTIDAD, useValue: { validar: noDisponible, consultar: rechazar } },
    {
      provide: ARCHIVO_PORT,
      useValue: {
        solicitarCarga: rechazar,
        confirmarCarga: rechazar,
        nuevaVersion: rechazar,
        confirmarVersion: rechazar,
        versiones: rechazar,
        marcarVigente: rechazar,
        urlDescarga: rechazar,
        estado: rechazar,
      },
    },
  ],
  exports: [CATALOGO_PORT, IDENTIDAD, ARCHIVO_PORT],
})
class PuertosNoUsadosEnWorkerModule {}

/** `PERSONA_PORT` y `CONSENTIMIENTO_PORT` para NotificacionesModule.registerWorker. Las entidades ENTIDADES_PER van en el DataSource. */
export function personasParaWorker(): DynamicModule {
  return PersonasModule.register({ imports: [PuertosNoUsadosEnWorkerModule] });
}
