import { Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { ARCHIVO_PORT, type ArchivoPort } from '@vitrina/plataforma/archivos';
import { AUDITORIA, type AuditoriaPort } from '@vitrina/plataforma/auditoria';
import { CATALOGO_PORT, type CatalogoPort } from '@vitrina/plataforma/catalogos';
import { IDENTIDAD, type IdentidadPort } from '@vitrina/plataforma/identidad';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { SuscripcionRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { ActualizarDatosBasicos } from './application/actualizar-datos-basicos.js';
import { AgregarContacto } from './application/agregar-contacto.js';
import { AgregarDireccion } from './application/agregar-direccion.js';
import { AsignarRolPersona } from './application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from './application/buscar-persona.js';
import { BuscarPersonas } from './application/buscar-personas.js';
import { ConsultarConsentimientos } from './application/consentimientos/consultar-consentimientos.js';
import { ConsultarTextos } from './application/consentimientos/consultar-textos.js';
import { PublicarTextoFinalidad } from './application/consentimientos/publicar-texto-finalidad.js';
import { RegistrarConsentimientos } from './application/consentimientos/registrar-consentimientos.js';
import { RevocarConsentimiento } from './application/consentimientos/revocar-consentimiento.js';
import { ServicioConsentimientos } from './application/consentimientos/servicio-consentimientos.js';
import type { DependenciasPersonas } from './application/dependencias-personas.js';
import { EditarContacto } from './application/editar-contacto.js';
import { EditarDireccion } from './application/editar-direccion.js';
import { EliminarContacto } from './application/eliminar-contacto.js';
import { EliminarDireccion } from './application/eliminar-direccion.js';
import { ObtenerPersona } from './application/obtener-persona.js';
import { CONSENTIMIENTO_PORT, type ConsentimientoPort } from './application/ports/consentimiento.port.js';
import { PERSONA_PORT, type PersonaPort } from './application/ports/persona.port.js';
import { RegistrarPersona } from './application/registrar-persona.js';
import { ServicioPersonas } from './application/servicio-personas.js';
import { SuscripcionesDelTenantOrg } from './infrastructure/suscripciones-del-tenant.org.js';
import { RepositorioConsentimientosTypeOrm } from './infrastructure/typeorm/consentimientos.repositorio.js';
import { ConsultaPersonasTypeOrm } from './infrastructure/typeorm/consulta-personas.typeorm.js';
import { RepositorioPersonasTypeOrm } from './infrastructure/typeorm/personas.repositorio.js';
import { ConsentimientosPersonaController } from './interface/consentimientos.controller.js';
import { ContactosPersonaController } from './interface/contactos.controller.js';
import { DireccionesPersonaController } from './interface/direcciones.controller.js';
import { PersonasController } from './interface/personas.controller.js';
import { TextosFinalidadController } from './interface/textos-finalidad.controller.js';

const DEPENDENCIAS_PERSONAS = Symbol('DependenciasPersonas');

type CasoDeUso = new (dependencias: DependenciasPersonas) => unknown;

const CASOS_DE_USO: CasoDeUso[] = [
  BuscarPersonas,
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
];

const proveedorDe = (casoDeUso: CasoDeUso): Provider => ({
  provide: casoDeUso,
  useFactory: (dependencias: DependenciasPersonas) => new casoDeUso(dependencias),
  inject: [DEPENDENCIAS_PERSONAS],
});

export interface PersonasOpciones {
  /**
   * Módulos que exportan `IDENTIDAD` (IdentidadModule), `CATALOGO_PORT` (CatalogosModule) y `ARCHIVO_PORT`
   * (ArchivosModule), con la misma instancia que la app.
   */
  imports: ModuleMetadata['imports'];
}

// Usa los tokens de KernelInfraModule, SeguridadModule y AuditoriaModule (los tres globales), que la app debe importar.
// Las entidades ENTIDADES_PER van en el DataSource de la app.
@Module({})
export class PersonasModule {
  static register(opciones: PersonasOpciones): DynamicModule {
    return {
      module: PersonasModule,
      imports: opciones.imports,
      controllers: [
        PersonasController,
        ContactosPersonaController,
        DireccionesPersonaController,
        ConsentimientosPersonaController,
        TextosFinalidadController,
      ],
      providers: [
        {
          provide: DEPENDENCIAS_PERSONAS,
          useFactory: (
            unidadDeTrabajo: TypeOrmUnitOfWork,
            contexto: TenantContext,
            reloj: Clock,
            ids: IdGenerator,
            publicador: EventPublisher,
            catalogo: CatalogoPort,
            identidad: IdentidadPort,
            auditoria: AuditoriaPort,
            archivos: ArchivoPort,
          ): DependenciasPersonas => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            ids,
            publicador,
            personas: new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto),
            consultaPersonas: new ConsultaPersonasTypeOrm(unidadDeTrabajo, contexto),
            suscripciones: new SuscripcionesDelTenantOrg(new SuscripcionRepositorioTypeOrm(unidadDeTrabajo, contexto)),
            catalogo,
            identidad,
            consentimientos: new RepositorioConsentimientosTypeOrm(unidadDeTrabajo, contexto),
            auditoria,
            archivos,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, CATALOGO_PORT, IDENTIDAD, AUDITORIA, ARCHIVO_PORT],
        },
        ...CASOS_DE_USO.map(proveedorDe),
        {
          provide: PERSONA_PORT,
          useFactory: (
            buscarPorDocumento: BuscarPersonaPorDocumento,
            obtener: ObtenerPersona,
            registrar: RegistrarPersona,
            asignarRol: AsignarRolPersona,
            agregarContacto: AgregarContacto,
            agregarDireccion: AgregarDireccion,
          ): PersonaPort =>
            new ServicioPersonas({ buscarPorDocumento, obtener, registrar, asignarRol, agregarContacto, agregarDireccion }),
          inject: [BuscarPersonaPorDocumento, ObtenerPersona, RegistrarPersona, AsignarRolPersona, AgregarContacto, AgregarDireccion],
        },
        {
          provide: CONSENTIMIENTO_PORT,
          useFactory: (
            consultarConsentimientos: ConsultarConsentimientos,
            consultarTextos: ConsultarTextos,
            registrar: RegistrarConsentimientos,
            revocar: RevocarConsentimiento,
          ): ConsentimientoPort => new ServicioConsentimientos({ consultarConsentimientos, consultarTextos, registrar, revocar }),
          inject: [ConsultarConsentimientos, ConsultarTextos, RegistrarConsentimientos, RevocarConsentimiento],
        },
      ],
      exports: [PERSONA_PORT, CONSENTIMIENTO_PORT],
    };
  }
}
