import { HttpException, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { from, switchMap, type Observable } from 'rxjs';
import type { SesionSoporte } from '../application/ports/lectura-soporte.js';
import type { RegistrarPeticionSoporte, ResultadoPeticionSoporte } from '../application/registrar-peticion-soporte.js';
import type { ResolverAccesoSoporteVigente } from '../application/resolver-acceso-soporte.js';
import { AuditoriaNoDisponibleError, SoportePermisoVetadoError, SoporteSoloLecturaError } from '../domain/errores.js';
import { PERMISOS_VETADOS_SOPORTE } from '../domain/permisos-seg.js';
import { ESCRITURA_PERMITIDA_EN_SOPORTE, PERMISO, type SolicitudAutenticada } from './decoradores.js';

const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);
const VETADOS = new Set(PERMISOS_VETADOS_SOPORTE);
const HTTP_PROHIBIDO = 403;
const HTTP_NO_DISPONIBLE = 503;

interface PeticionHttp extends SolicitudAutenticada {
  method: string;
  ip?: string;
  route?: { path?: string };
}

type Aviso = (mensaje: string, datos: Record<string, unknown>) => void;

/**
 * Sesiones de soporte (spec 18, TR-RNF-110): veta permisos, aplica el modo LECTURA y audita cada
 * petición del agente antes del controlador. Si la bitácora no escribe, la petición no se ejecuta
 * (falla cerrado). Va después de los guards: lo que el agente no tiene ya lo negó PermisoGuard.
 */
export class SoporteInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: Pick<ResolverAccesoSoporteVigente, 'ejecutar'>,
    private readonly registrar: Pick<RegistrarPeticionSoporte, 'ejecutar'>,
    private readonly aviso: Aviso = () => undefined,
  ) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    return from(this.controlar(contexto)).pipe(switchMap(() => siguiente.handle()));
  }

  private async controlar(contexto: ExecutionContext): Promise<void> {
    const peticion = contexto.switchToHttp().getRequest<PeticionHttp>();
    const { principal } = peticion;
    if (!principal?.tenantId) return;
    const sesion = await this.resolver.ejecutar(principal.usuarioId, principal.tenantId);
    if (!sesion) return;

    const permiso = this.reflector.getAllAndOverride<string | undefined>(PERMISO, [contexto.getHandler(), contexto.getClass()]) ?? null;
    const resultado = this.resultadoDe(contexto, peticion.method, permiso, sesion);
    await this.auditar({
      usuarioId: principal.usuarioId,
      tenantId: principal.tenantId,
      sesion,
      metodo: peticion.method,
      ruta: peticion.route?.path ?? '(sin ruta)',
      permiso,
      resultado,
      ip: peticion.ip || null,
    });
    if (resultado === 'VETADA' && permiso) throw rechazo(HTTP_PROHIBIDO, new SoportePermisoVetadoError(permiso));
    if (resultado === 'SOLO_LECTURA') throw rechazo(HTTP_PROHIBIDO, new SoporteSoloLecturaError());
  }

  private resultadoDe(contexto: ExecutionContext, metodo: string, permiso: string | null, sesion: SesionSoporte): ResultadoPeticionSoporte {
    if (permiso && VETADOS.has(permiso)) return 'VETADA';
    if (sesion.modo === 'ESCRITURA' || METODOS_DE_LECTURA.has(metodo)) return 'PERMITIDA';
    const permitida = this.reflector.getAllAndOverride<boolean | undefined>(ESCRITURA_PERMITIDA_EN_SOPORTE, [contexto.getHandler(), contexto.getClass()]);
    return permitida ? 'PERMITIDA' : 'SOLO_LECTURA';
  }

  private async auditar(peticion: Parameters<RegistrarPeticionSoporte['ejecutar']>[0]): Promise<void> {
    try {
      await this.registrar.ejecutar(peticion);
    } catch (error) {
      // Sin datos de la petición: solo el acceso y el tipo de error (TR-RNF-026).
      this.aviso('No se pudo auditar una petición de soporte', {
        evento: 'seg.soporte.auditoria_falla',
        acceso_id: peticion.sesion.accesoId,
        error: error instanceof Error ? error.name : typeof error,
      });
      throw rechazo(HTTP_NO_DISPONIBLE, new AuditoriaNoDisponibleError());
    }
  }
}

function rechazo(estado: number, error: { code: string; message: string }): HttpException {
  return new HttpException({ codigo: error.code, mensaje: error.message }, estado);
}
