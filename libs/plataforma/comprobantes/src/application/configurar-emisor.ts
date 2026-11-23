import { Emisor } from '../domain/emisor.js';
import { EmpresaInactivaError, VersionObsoletaEmisorError } from '../domain/errores.js';
import { emisorConfigurado } from '../domain/eventos-fe.js';
import { ACCIONES_EMISOR, actorDe, bytesDe, ENTIDAD_EMISOR, guardarORotar, TIPOS_SECRETO_FE, type DependenciasEmisor } from './dependencias-fe.js';
import { vistaDe, type VistaEmisor } from './vista-emisor.js';

export interface ConfigurarEmisorComando {
  empresaId: string;
  proveedor: string;
  usuarioProveedor: string;
  /** Clave del proveedor. Ausente: se conserva la guardada. Nunca vuelve en la vista, el log ni la auditoría. */
  clave?: string;
  regimenIgv: string;
  leyendaPie?: string | null;
  /** Obligatoria si el emisor ya existe (bloqueo optimista); ausente al crearlo. */
  version?: number;
}

export interface ResultadoConfiguracion {
  vista: VistaEmisor;
  creado: boolean;
}

/**
 * TR-RF-052, pasos 1 y 2: crea o actualiza el emisor de la empresa con su proveedor y la credencial en la bóveda,
 * en una transacción: si algo falla después de guardar en la bóveda, no queda secreto, cambio, auditoría ni evento.
 */
export class ConfigurarEmisor {
  constructor(private readonly dependencias: DependenciasEmisor) {}

  async ejecutar(comando: ConfigurarEmisorComando): Promise<ResultadoConfiguracion> {
    const { unidadDeTrabajo, contexto, reloj, empresas, proveedores, emisores, boveda, publicador, auditoria } = this.dependencias;
    const actorId = actorDe(contexto);

    return unidadDeTrabajo.run(async () => {
      const empresa = await empresas.obtener(comando.empresaId);
      if (!empresa.activa) throw new EmpresaInactivaError();
      const proveedor = await proveedores.obtener(comando.proveedor);
      const ahora = reloj.now();

      const existente = await emisores.porEmpresa(empresa.id);
      exigirVersion(existente, comando.version);
      const emisor = existente ?? this.nuevoEmisor(empresa.id, actorId, ahora);
      const antes = existente && vistaDe(existente);
      const versionLeida = emisor.version;

      emisor.configurarProveedor({
        proveedor: proveedor.codigo,
        usuarioProveedor: comando.usuarioProveedor,
        regimenIgv: comando.regimenIgv,
        leyendaPie: comando.leyendaPie ?? null,
      });
      if (comando.clave !== undefined) {
        emisor.asignarCredencial(await guardarORotar(boveda, emisor.secretoCredencialId, TIPOS_SECRETO_FE.credencial, bytesDe(comando.clave)));
      }
      const pasoAConfigurado = emisor.recalcularEstado(proveedor.requiereCertificado, ahora);

      if (existente) {
        emisor.registrarModificacion(actorId, ahora);
        await emisores.actualizar(emisor, versionLeida);
      } else {
        await emisores.insertar(emisor);
      }
      if (pasoAConfigurado) await publicador.publish(emisorConfigurado(emisor.version, emisor.cargaConfigurado(), ahora));

      const despues = vistaDe(emisor);
      await auditoria.registrar({ accion: ACCIONES_EMISOR.configurar, entidadTipo: ENTIDAD_EMISOR, entidadId: emisor.id, antes, despues });
      return { vista: despues, creado: existente === null };
    });
  }

  private nuevoEmisor(empresaId: string, actorId: string, ahora: Date): Emisor {
    const { contexto, ids } = this.dependencias;
    return Emisor.crear({ id: ids.next(), tenantId: contexto.current().tenantId, empresaId, creadoPor: actorId, ahora });
  }
}

/** Con emisor, la versión leída debe coincidir; sin emisor, no se acepta una versión (el cliente vio otro estado). */
function exigirVersion(existente: Emisor | null, version: number | undefined): void {
  const esperada = existente?.version;
  if (version !== esperada) throw new VersionObsoletaEmisorError();
}
