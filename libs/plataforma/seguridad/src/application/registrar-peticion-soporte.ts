import type { TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import type { SesionSoporte } from './ports/lectura-soporte.js';
import type { BitacoraSeguridad } from './ports/repositorios.js';

export type ResultadoPeticionSoporte = 'PERMITIDA' | 'SOLO_LECTURA' | 'VETADA';

export interface PeticionDeSoporte {
  usuarioId: string;
  tenantId: string;
  sesion: SesionSoporte;
  metodo: string;
  /** Patrón de la ruta (`/v1/seg/miembros/:membresiaId`): sin ids, cuerpo ni query (TR-RNF-026). */
  ruta: string;
  permiso: string | null;
  resultado: ResultadoPeticionSoporte;
  ip: string | null;
}

export interface DependenciasRegistroPeticion {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  bitacora: BitacoraSeguridad;
}

/** Una fila ACCESO_SOPORTE por petición del agente, en su propia transacción y antes del controlador (TR-RNF-110). */
export class RegistrarPeticionSoporte {
  constructor(private readonly dependencias: DependenciasRegistroPeticion) {}

  ejecutar(peticion: PeticionDeSoporte): Promise<void> {
    const { contexto, unidadDeTrabajo, bitacora } = this.dependencias;
    const { sesion } = peticion;
    return contexto.run({ tenantId: peticion.tenantId }, () =>
      unidadDeTrabajo.run(() =>
        bitacora.registrar(
          'ACCESO_SOPORTE',
          peticion.usuarioId,
          {
            accion: 'PETICION',
            acceso_id: sesion.accesoId,
            ticket: sesion.ticket,
            modo: sesion.modo,
            metodo: peticion.metodo,
            ruta: peticion.ruta,
            permiso: peticion.permiso,
            resultado: peticion.resultado,
          },
          peticion.ip,
        ),
      ),
    );
  }
}
