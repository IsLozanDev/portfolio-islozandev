import { Module, type DynamicModule, type ModuleMetadata } from '@nestjs/common';
import { CATALOGO_PORT, type CatalogoPort } from '@vitrina/plataforma/catalogos';
import { IDENTIDAD, type IdentidadPort } from '@vitrina/plataforma/identidad';
import type { Clock, EventPublisher, IdGenerator, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, EVENT_PUBLISHER, ID_GENERATOR, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { SuscripcionRepositorioTypeOrm } from '@vitrina/plataforma/org';
import { AsignarRolPersona } from './application/asignar-rol.js';
import { BuscarPersonaPorDocumento } from './application/buscar-persona.js';
import type { DependenciasPersonas } from './application/dependencias-personas.js';
import { ObtenerPersona } from './application/obtener-persona.js';
import { PERSONA_PORT, type PersonaPort } from './application/ports/persona.port.js';
import { RegistrarPersona } from './application/registrar-persona.js';
import { ServicioPersonas } from './application/servicio-personas.js';
import { SuscripcionesDelTenantOrg } from './infrastructure/suscripciones-del-tenant.org.js';
import { RepositorioPersonasTypeOrm } from './infrastructure/typeorm/personas.repositorio.js';
import { PersonasController } from './interface/personas.controller.js';

const DEPENDENCIAS_PERSONAS = Symbol('DependenciasPersonas');

export interface PersonasOpciones {
  /** Módulos que exportan `IDENTIDAD` (IdentidadModule) y `CATALOGO_PORT` (CatalogosModule). */
  imports: ModuleMetadata['imports'];
}

// Usa los tokens de KernelInfraModule y SeguridadModule (ambos globales), que la app debe importar.
// Las entidades ENTIDADES_PER van en el DataSource de la app.
@Module({})
export class PersonasModule {
  static register(opciones: PersonasOpciones): DynamicModule {
    return {
      module: PersonasModule,
      imports: opciones.imports,
      controllers: [PersonasController],
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
          ): DependenciasPersonas => ({
            unidadDeTrabajo,
            contexto,
            reloj,
            ids,
            publicador,
            personas: new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto),
            suscripciones: new SuscripcionesDelTenantOrg(new SuscripcionRepositorioTypeOrm(unidadDeTrabajo, contexto)),
            catalogo,
            identidad,
          }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK, ID_GENERATOR, EVENT_PUBLISHER, CATALOGO_PORT, IDENTIDAD],
        },
        {
          provide: BuscarPersonaPorDocumento,
          useFactory: (dependencias: DependenciasPersonas) => new BuscarPersonaPorDocumento(dependencias),
          inject: [DEPENDENCIAS_PERSONAS],
        },
        {
          provide: RegistrarPersona,
          useFactory: (dependencias: DependenciasPersonas) => new RegistrarPersona(dependencias),
          inject: [DEPENDENCIAS_PERSONAS],
        },
        {
          provide: ObtenerPersona,
          useFactory: (dependencias: DependenciasPersonas) => new ObtenerPersona(dependencias),
          inject: [DEPENDENCIAS_PERSONAS],
        },
        {
          provide: AsignarRolPersona,
          useFactory: (dependencias: DependenciasPersonas) => new AsignarRolPersona(dependencias),
          inject: [DEPENDENCIAS_PERSONAS],
        },
        {
          provide: PERSONA_PORT,
          useFactory: (
            buscarPorDocumento: BuscarPersonaPorDocumento,
            obtener: ObtenerPersona,
            registrar: RegistrarPersona,
            asignarRol: AsignarRolPersona,
          ): PersonaPort => new ServicioPersonas({ buscarPorDocumento, obtener, registrar, asignarRol }),
          inject: [BuscarPersonaPorDocumento, ObtenerPersona, RegistrarPersona, AsignarRolPersona],
        },
      ],
      exports: [PERSONA_PORT],
    };
  }
}
