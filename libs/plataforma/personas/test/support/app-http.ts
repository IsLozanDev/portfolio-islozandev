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
import { BuscarPersonas } from '../../src/application/buscar-personas.js';
import { ConsultarConsentimientos } from '../../src/application/consentimientos/consultar-consentimientos.js';
import { ConsultarTextos } from '../../src/application/consentimientos/consultar-textos.js';
import { PublicarTextoFinalidad } from '../../src/application/consentimientos/publicar-texto-finalidad.js';
import { RegistrarConsentimientos } from '../../src/application/consentimientos/registrar-consentimientos.js';
import { RevocarConsentimiento } from '../../src/application/consentimientos/revocar-consentimiento.js';
import { CompararPar } from '../../src/application/duplicados/comparar-par.js';
import { DescartarPar } from '../../src/application/duplicados/descartar-par.js';
import { FusionarPersonas } from '../../src/application/duplicados/fusionar-personas.js';
import { ListarDuplicados } from '../../src/application/duplicados/listar-duplicados.js';
import { QuitarDescarte } from '../../src/application/duplicados/quitar-descarte.js';
import { EditarContacto } from '../../src/application/editar-contacto.js';
import { ListarProductosSuscritos } from '../../src/application/listar-productos-suscritos.js';
import { EditarDireccion } from '../../src/application/editar-direccion.js';
import { EliminarContacto } from '../../src/application/eliminar-contacto.js';
import { EliminarDireccion } from '../../src/application/eliminar-direccion.js';
import { ObtenerPersona } from '../../src/application/obtener-persona.js';
import { RegistrarPersona } from '../../src/application/registrar-persona.js';
import { ConsentimientosPersonaController } from '../../src/interface/consentimientos.controller.js';
import { ContactosPersonaController } from '../../src/interface/contactos.controller.js';
import { DireccionesPersonaController } from '../../src/interface/direcciones.controller.js';
import { DuplicadosController } from '../../src/interface/duplicados.controller.js';
import { FusionesController } from '../../src/interface/fusiones.controller.js';
import { PersonasController } from '../../src/interface/personas.controller.js';
import { TextosFinalidadController } from '../../src/interface/textos-finalidad.controller.js';
import { TENANT_A, type Dobles } from './dobles.js';

export const USUARIO = 'cccccccc-0000-4000-8000-000000000003';
export const SUCURSAL = '0193f3a0-0000-7000-8000-000000000102';
const MFA_MAX_EDAD_SEG = 900;
const SEGUNDOS_POR_MS = 1000;
/** Los permisos de personas con `sensible: true` en el manifiesto (spec 39). */
const PERMISOS_SENSIBLES = ['plat.persona.fusionar'];

/** La sesión del token de prueba: sin MFA salvo que la prueba la pida. */
export const sesionDePrueba = { conMfa: false };

const CASOS_DE_USO = [
  BuscarPersonas,
  ListarProductosSuscritos,
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
  ConsultarConsentimientos,
  RegistrarConsentimientos,
  RevocarConsentimiento,
  PublicarTextoFinalidad,
  ConsultarTextos,
  ListarDuplicados,
  CompararPar,
  DescartarPar,
  QuitarDescarte,
  FusionarPersonas,
];

/** Hace lo que deja AutenticacionGuard: el principal del token, con un factor TOTP reciente si la sesión tiene MFA. */
class PrincipalDePrueba implements CanActivate {
  canActivate(contexto: ExecutionContext): boolean {
    const solicitud = contexto.switchToHttp().getRequest();
    const mfa = sesionDePrueba.conMfa
      ? { aal: 'aal2', amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / SEGUNDOS_POR_MS) }] }
      : { aal: 'aal1', amr: [] };
    solicitud.principal = { usuarioId: USUARIO, tenantId: TENANT_A, tipo: 'INTERNO', sesionId: 'sesion', ...mfa };
    return true;
  }
}

type DependenciasGuard = ConstructorParameters<typeof PermisoGuard>;

/** Los controladores de personas sobre los dobles, bajo /v1 y con el PermisoGuard real. */
export async function crearAppPersonas(dobles: Dobles, permisosDelActor: () => string[]): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    controllers: [
      DuplicadosController,
      FusionesController,
      PersonasController,
      ContactosPersonaController,
      DireccionesPersonaController,
      ConsentimientosPersonaController,
      TextosFinalidadController,
    ],
    providers: CASOS_DE_USO.map((CasoDeUso) => ({ provide: CasoDeUso, useValue: new CasoDeUso(dobles) })),
  }).compile();
  const app = modulo.createNestApplication({ logger: false });

  const resolver = { ejecutar: async () => ({ permisos: permisosDelActor() }) } as unknown as DependenciasGuard[1];
  const catalogo = { sensible: async (permiso: string) => PERMISOS_SENSIBLES.includes(permiso) } as unknown as DependenciasGuard[2];
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
