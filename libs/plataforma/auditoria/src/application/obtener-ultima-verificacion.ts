import type { UnitOfWork } from '@vitrina/plataforma/kernel';
import { SinVerificacionesError } from '../domain/errores.js';
import { PERMISOS_AUD } from '../domain/permisos-aud.js';
import type { Verificacion } from '../domain/verificacion.js';
import { exigirAlcanceTenant, type DependenciasAlcance } from './alcance-auditoria.js';
import type { RegistroVerificaciones } from './ports/registro-verificaciones.port.js';

export interface DependenciasUltimaVerificacion extends DependenciasAlcance {
  unidadDeTrabajo: UnitOfWork;
  registro: Pick<RegistroVerificaciones, 'ultima'>;
}

/** Último resultado de integridad del tenant. Es de todo el tenant: sin alcance TENANT, 403 (spec 20b). */
export class ObtenerUltimaVerificacion {
  constructor(private readonly dependencias: DependenciasUltimaVerificacion) {}

  ejecutar(): Promise<Verificacion> {
    const { unidadDeTrabajo, registro } = this.dependencias;
    return unidadDeTrabajo.run(async () => {
      await exigirAlcanceTenant(this.dependencias, PERMISOS_AUD.consultar);
      const ultima = await registro.ultima();
      if (!ultima) throw new SinVerificacionesError();
      return ultima;
    });
  }
}
