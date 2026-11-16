import { Module, type DynamicModule } from '@nestjs/common';
import type { Clock, TenantContext } from '@vitrina/plataforma/kernel';
import { CLOCK, TENANT_CONTEXT, TypeOrmUnitOfWork } from '@vitrina/plataforma/kernel-infra';
import { ConsultarDocumento } from './application/consultar-documento.js';
import { IDENTIDAD, type IdentidadPort } from './application/ports/identidad.port.js';
import type { HasherDocumento } from './application/ports/persistencia.js';
import type { ProveedorIdentidad } from './application/ports/proveedores.js';
import { ServicioIdentidad } from './application/servicio-identidad.js';
import { CuotaNula } from './infrastructure/cuota.nula.js';
import { ProveedorDecolecta } from './infrastructure/decolecta/proveedor.decolecta.js';
import { ProveedorFalso } from './infrastructure/falso/proveedor.falso.js';
import { ProveedorConRespaldo } from './infrastructure/respaldo/proveedor-con-respaldo.js';
import { BitacoraConsultasTypeOrm } from './infrastructure/typeorm/bitacora-consultas.repositorio.js';
import { CacheIdentidadRepositorioTypeOrm } from './infrastructure/typeorm/cache-identidad.repositorio.js';
import { ConfiguracionProveedoresTypeOrm } from './infrastructure/typeorm/configuracion-proveedores.repositorio.js';
import type { ProveedorElegido } from './interface/entorno-identidad.js';
import { IdentidadController } from './interface/identidad.controller.js';

export interface IdentidadOpciones {
  proveedor: ProveedorElegido;
  /** Obligatorio con `decolecta`; lo exige exigirProveedorReal al validar el entorno. */
  decolectaToken?: string;
  /** TR-RNF-111: lo arma apps/api con hashDocumento y la sal de observabilidad, que idn no importa (PL-10). */
  hasher: HasherDocumento;
}

/** Con `falso`, el adaptador falso responde bajo el código DECOLECTA de idn.proveedor. */
function crearProveedores({ proveedor, decolectaToken }: IdentidadOpciones): ProveedorIdentidad[] {
  if (proveedor === 'falso') return [new ProveedorFalso()];
  if (!decolectaToken) throw new Error('IDN_DECOLECTA_TOKEN es obligatorio con el proveedor decolecta');
  return [new ProveedorDecolecta({ token: decolectaToken })];
}

// Usa los tokens de KernelInfraModule y SeguridadModule (ambos globales), que la app debe importar.
// Las entidades ENTIDADES_IDN van en el DataSource de la app.
@Module({})
export class IdentidadModule {
  static register(opciones: IdentidadOpciones): DynamicModule {
    const proveedores = crearProveedores(opciones);
    return {
      module: IdentidadModule,
      controllers: [IdentidadController],
      providers: [
        {
          provide: ConsultarDocumento,
          // Un solo ProveedorConRespaldo por instancia: sus circuit breakers viven en memoria.
          useFactory: (unidadDeTrabajo: TypeOrmUnitOfWork, contexto: TenantContext, reloj: Clock) =>
            new ConsultarDocumento({
              unidadDeTrabajo,
              contexto,
              reloj,
              cache: new CacheIdentidadRepositorioTypeOrm(unidadDeTrabajo),
              bitacora: new BitacoraConsultasTypeOrm(unidadDeTrabajo),
              configuracion: new ConfiguracionProveedoresTypeOrm(unidadDeTrabajo),
              consultor: new ProveedorConRespaldo(proveedores, reloj),
              cuota: new CuotaNula(),
              hasher: opciones.hasher,
            }),
          inject: [TypeOrmUnitOfWork, TENANT_CONTEXT, CLOCK],
        },
        {
          provide: IDENTIDAD,
          useFactory: (consultarDocumento: ConsultarDocumento): IdentidadPort => new ServicioIdentidad(consultarDocumento),
          inject: [ConsultarDocumento],
        },
      ],
      exports: [IDENTIDAD],
    };
  }
}
