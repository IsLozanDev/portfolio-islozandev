import type { Clock, TenantContext, UnitOfWork } from '@vitrina/plataforma/kernel';
import { validarDocumento, type TipoDocumento } from '@vitrina/shared/util';
import { esTipoConsultable } from '../domain/datos-identidad.js';
import { crearEntradaCache, estaVigente, type EntradaCache } from '../domain/entrada-cache.js';
import {
  DocumentoInvalidoError,
  DocumentoNoEncontradoError,
  ProveedorNoDisponibleError,
  TipoNoConsultableError,
} from '../domain/errores.js';
import type { ResultadoConsulta } from '../domain/resultado-consulta.js';
import type { CuotaPort } from './ports/cuota.port.js';
import type { ConsultaDocumento, RespuestaConsulta } from './ports/identidad.port.js';
import type { BitacoraConsultas, CacheIdentidadRepository, HasherDocumento } from './ports/persistencia.js';
import type {
  ConfiguracionProveedores,
  ConsultorProveedores,
  ProveedorConfigurado,
  RespuestaProveedores,
} from './ports/proveedores.js';
import { respuestaDesdeEntrada } from './respuesta-consulta.js';

export interface DependenciasIdentidad {
  unidadDeTrabajo: UnitOfWork;
  contexto: TenantContext;
  reloj: Clock;
  cache: CacheIdentidadRepository;
  bitacora: BitacoraConsultas;
  configuracion: ConfiguracionProveedores;
  consultor: ConsultorProveedores;
  cuota: CuotaPort;
  hasher: HasherDocumento;
}

/** Igual que ConsultaDocumento, pero admite CE y PAS para responder TIPO_NO_CONSULTABLE. */
export type ComandoConsultarDocumento = Omit<ConsultaDocumento, 'tipo'> & { tipo: TipoDocumento };

type Preparacion =
  | { paso: 'RESPONDIDA_DESDE_CACHE'; entrada: EntradaCache }
  | { paso: 'CUOTA_AGOTADA' }
  | { paso: 'CONSULTAR_PROVEEDOR'; configurados: ProveedorConfigurado[] };

/**
 * TR-RF-045 y 046 (OP-06). La llamada al proveedor va fuera de la transacción: la caché, la cuota y la
 * configuración se leen en una transacción y la caché y la bitácora se escriben en otra corta posterior.
 */
export class ConsultarDocumento {
  constructor(private readonly dependencias: DependenciasIdentidad) {}

  async ejecutar(comando: ComandoConsultarDocumento): Promise<RespuestaConsulta> {
    const { tipo } = comando;
    if (!esTipoConsultable(tipo)) throw new TipoNoConsultableError();
    const consulta: ConsultaDocumento = { ...comando, tipo };

    const validez = validarDocumento(tipo, consulta.numero);
    if (!validez.valido) {
      await this.dependencias.unidadDeTrabajo.run(() => this.registrar(consulta, 'INVALIDO', null));
      throw new DocumentoInvalidoError(validez.motivo);
    }

    const preparacion = await this.prepararConsulta(consulta);
    if (preparacion.paso === 'RESPONDIDA_DESDE_CACHE') return respuestaDesdeEntrada(preparacion.entrada, 'CACHE');
    // Sin cuota el cliente sigue con el registro manual, como sin proveedor (TR-RNF-007).
    if (preparacion.paso === 'CUOTA_AGOTADA') throw new ProveedorNoDisponibleError();

    const respuesta = await this.dependencias.consultor.consultar(tipo, consulta.numero, preparacion.configurados);
    return this.cerrarConsulta(consulta, respuesta);
  }

  private prepararConsulta(consulta: ConsultaDocumento): Promise<Preparacion> {
    const { unidadDeTrabajo, cache, cuota, configuracion, reloj } = this.dependencias;

    return unidadDeTrabajo.run(async () => {
      const entrada = await cache.obtener(consulta.tipo, consulta.numero);
      if (entrada && estaVigente(entrada, reloj.now())) {
        await this.registrar(consulta, 'CACHE', entrada.fuente);
        return { paso: 'RESPONDIDA_DESDE_CACHE', entrada };
      }

      if (!(await cuota.reservar(this.tenantId()))) {
        await this.registrar(consulta, 'CUOTA_AGOTADA', null);
        return { paso: 'CUOTA_AGOTADA' };
      }

      return { paso: 'CONSULTAR_PROVEEDOR', configurados: await configuracion.activosPara(consulta.tipo) };
    });
  }

  private async cerrarConsulta(consulta: ConsultaDocumento, respuesta: RespuestaProveedores): Promise<RespuestaConsulta> {
    const { unidadDeTrabajo, cuota, cache, reloj } = this.dependencias;

    if (respuesta.resultado === 'NO_DISPONIBLE') {
      await unidadDeTrabajo.run(async () => {
        await cuota.liberar(this.tenantId());
        await this.registrar(consulta, 'PROVEEDOR_NO_DISPONIBLE', null);
      });
      throw new ProveedorNoDisponibleError();
    }

    if (respuesta.resultado === 'NO_ENCONTRADO') {
      await unidadDeTrabajo.run(() => this.registrar(consulta, 'NO_ENCONTRADO', respuesta.proveedor.codigo));
      throw new DocumentoNoEncontradoError();
    }

    const entrada = crearEntradaCache({
      documento: respuesta.documento,
      numero: consulta.numero,
      fuente: respuesta.proveedor.codigo,
      consultadoEn: reloj.now(),
      ttlDias: respuesta.proveedor.ttlDias,
    });
    await unidadDeTrabajo.run(async () => {
      await cache.guardar(entrada);
      await this.registrar(consulta, 'PROVEEDOR', entrada.fuente);
    });
    return respuestaDesdeEntrada(entrada, 'PROVEEDOR');
  }

  private registrar(consulta: ConsultaDocumento, resultado: ResultadoConsulta, proveedor: string | null): Promise<void> {
    const { contexto, bitacora, hasher, reloj } = this.dependencias;
    const { tenantId, actorId } = contexto.current();

    return bitacora.registrar({
      tenantId,
      usuarioId: actorId ?? null,
      productoCodigo: consulta.productoCodigo ?? null,
      tipo: consulta.tipo,
      numeroHash: hasher.hashear(consulta.numero),
      motivo: consulta.motivo,
      resultado,
      proveedor,
      consultadoEn: reloj.now(),
    });
  }

  private tenantId(): string {
    return this.dependencias.contexto.current().tenantId;
  }
}
