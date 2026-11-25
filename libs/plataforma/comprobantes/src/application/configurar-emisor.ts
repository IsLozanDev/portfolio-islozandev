import { exigirDireccionFiscal } from '../domain/emisor-documento.js';
import { Emisor } from '../domain/emisor.js';
import { EmpresaInactivaError, VersionObsoletaEmisorError } from '../domain/errores.js';
import { emisorConfigurado } from '../domain/eventos-fe.js';
import { exigirUsuarioSol } from '../domain/usuario-sol.js';
import {
  ACCIONES_EMISOR,
  actorDe,
  bytesDe,
  ENTIDAD_EMISOR,
  esSunatDirecto,
  exigirProveedorDelAmbiente,
  guardarORotar,
  TIPOS_SECRETO_FE,
  urlDelProveedor,
  type DependenciasEmisor,
} from './dependencias-fe.js';
import type { EmpresaEmisora } from './ports/empresa-emisora.port.js';
import type { ProveedorFe } from './ports/proveedores-fe.js';
import { vistaDe, type VistaEmisor } from './vista-emisor.js';

export interface ConfigurarEmisorComando {
  empresaId: string;
  proveedor: string;
  usuarioProveedor: string;
  /** Clave del proveedor. Ausente: se conserva la guardada. Nunca vuelve en la vista, el log ni la auditoría. */
  clave?: string;
  regimenIgv: string;
  leyendaPie?: string | null;
  /** Ruta del proveedor (no es secreta). Obligatoria si el proveedor declara dominios permitidos; ausente es null. */
  urlProveedor?: string | null;
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
 * Tras verificar, cambiar proveedor, URL o credencial vuelve a CONFIGURADO; en producción solo se rota la credencial.
 */
export class ConfigurarEmisor {
  constructor(private readonly dependencias: DependenciasEmisor) {}

  async ejecutar(comando: ConfigurarEmisorComando): Promise<ResultadoConfiguracion> {
    const { unidadDeTrabajo, contexto, reloj, empresas, proveedores, emisores, boveda, publicador, auditoria, entorno } = this.dependencias;
    const actorId = actorDe(contexto);

    return unidadDeTrabajo.run(async () => {
      const empresa = await empresas.obtener(comando.empresaId);
      if (!empresa.activa) throw new EmpresaInactivaError();
      const proveedor = await proveedores.obtener(comando.proveedor);
      exigirProveedorDelAmbiente(proveedor, entorno);
      const urlProveedor = urlDelProveedor(comando.urlProveedor ?? null, proveedor);
      const usuarioProveedor = usuarioDelProveedor(comando.usuarioProveedor, proveedor, empresa);
      const ahora = reloj.now();

      const existente = await emisores.porEmpresa(empresa.id);
      exigirVersion(existente, comando.version);
      const emisor = existente ?? this.nuevoEmisor(empresa.id, actorId, ahora);
      const antes = existente && vistaDe(existente);
      const versionLeida = emisor.version;

      emisor.configurarProveedor({
        proveedor: proveedor.codigo,
        usuarioProveedor,
        regimenIgv: comando.regimenIgv,
        leyendaPie: comando.leyendaPie ?? null,
        urlProveedor,
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

/** SUNAT directo: usuario secundario SOL sin el RUC y la dirección fiscal que exige el UBL armado en casa. */
function usuarioDelProveedor(usuario: string, proveedor: ProveedorFe, empresa: EmpresaEmisora): string {
  if (!esSunatDirecto(proveedor)) return usuario;
  const usuarioSol = exigirUsuarioSol(usuario);
  exigirDireccionFiscal(empresa);
  return usuarioSol;
}

/** Con emisor, la versión leída debe coincidir; sin emisor, no se acepta una versión (el cliente vio otro estado). */
function exigirVersion(existente: Emisor | null, version: number | undefined): void {
  const esperada = existente?.version;
  if (version !== esperada) throw new VersionObsoletaEmisorError();
}
