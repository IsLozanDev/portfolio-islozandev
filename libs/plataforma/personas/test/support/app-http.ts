import 'reflect-metadata';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PermisoGuard } from '@vitrina/plataforma/seguridad';
import { ActualizarDatosBasicos } from '../../src/application/actualizar-datos-basicos.js';
import { AgregarContacto } from '../../src/application/agregar-contacto.js';
import { AgregarDireccion } from '../../src/application/agregar-direccion.js';
import { AsignarRolPersona } from '../../src/application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from '../../src/application/buscar-persona.js';
import { EditarContacto } from '../../src/application/editar-contacto.js';
import { EditarDireccion } from '../../src/application/editar-direccion.js';
import { EliminarContacto } from '../../src/application/eliminar-contacto.js';
import { EliminarDireccion } from '../../src/application/eliminar-direccion.js';
import { ObtenerPersona } from '../../src/application/obtener-persona.js';
import { RegistrarPersona } from '../../src/application/registrar-persona.js';
import { ContactosPersonaController } from '../../src/interface/contactos.controller.js';
import { DireccionesPersonaController } from '../../src/interface/direcciones.controller.js';
import { PersonasController } from '../../src/interface/personas.controller.js';
import { TENANT_A, type Dobles } from './dobles.js';

export const USUARIO = 'cccccccc-0000-4000-8000-000000000003';
export const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;

const CASOS_DE_USO = [
  BuscarPersonaPorDocumento,
  RegistrarPersona,
  ObtenerPersona,
  AsignarRolPersona,
  ActualizarDatosBasicos,
  AgregarContacto,
  EditarContacto,
  EliminarContacto,
  AgregarDireccion,
  EditarDireccion,
  EliminarDireccion,
];

/** Hace lo que deja AutenticacionGuard: el principal del token. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', aal: 'aal1', sesionId: 'sesion', amr: [] };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

/** Los tres controladores de personas sobre los dobles, bajo /v1 y con el PermisoGuard real. */
export async function crearAppPersonas(dobles: Dobles, permisosDelActor: () => string[]): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    controllers: [PersonasController, ContactosPersonaController, DireccionesPersonaController],
    providers: CASOS_DE_USO.map((CasoDeUso) => ({ provide: CasoDeUso, useValue: new CasoDeUso(dobles) })),
  }).compile();
  const app = modulo.createNestApplication({ logger: false });

  const resolver = { ejecutar: async () => ({ permisos: permisosDelActor() }) } as unknown as DependenciasGuard[1];
  const catalogo = { sensible: async () => false } as unknown as DependenciasGuard[2];
  const bitacora = { registrar: async () => undefined } as unknown as DependenciasGuard[3];
  const unidadDeTrabajo: DependenciasGuard[4] = { run: (trabajo) => trabajo() };
  const contexto: DependenciasGuard[5] = { current: () => ({ tenantId: TENANT_A }), run: (_alcance, trabajo) => trabajo() };
  app.useGlobalGuards(
    new PrincipalDePrueba(),
    new PermisoGuard(new Reflector(), resolver, catalogo, bitacora, unidadDeTrabajo, contexto, MFA_MAX_EDAD_SEG),
  );
  app.setGlobalPrefix('v1');
  await app.init();
  return app;
}
