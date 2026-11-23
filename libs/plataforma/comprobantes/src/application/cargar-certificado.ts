import type { CertificadoEmisor, Emisor, SecretosCertificado } from '../domain/emisor.js';
import { ArchivoCertificadoInvalidoError, EmisorNoEncontradoError, EmpresaInactivaError } from '../domain/errores.js';
import { emisorConfigurado } from '../domain/eventos-fe.js';
import { ACCIONES_EMISOR, actorDe, bytesDe, ENTIDAD_EMISOR, guardarORotar, TIPOS_SECRETO_FE, type DependenciasEmisor } from './dependencias-fe.js';
import { vistaDe, type VistaEmisor } from './vista-emisor.js';

const BYTES_POR_KB = 1024;
/** Un .pfx con su cadena ocupa unos pocos KB: 50 KB deja margen y corta archivos que no lo son. */
export const KB_MAXIMOS_CERTIFICADO = 50;
export const BYTES_MAXIMOS_CERTIFICADO = KB_MAXIMOS_CERTIFICADO * BYTES_POR_KB;

export interface CargarCertificadoComando {
  empresaId: string;
  pfx: Uint8Array;
  /** Nunca vuelve en la vista, el log, el error ni la auditoría. */
  clave: string;
}

/** Lo que audita la carga: los datos públicos del certificado, nunca su contenido ni su clave. */
function datosPublicos(certificado: CertificadoEmisor | null): CertificadoEmisor | null {
  return certificado && { ruc: certificado.ruc, venceEn: certificado.venceEn, huellaSha256: certificado.huellaSha256 };
}

function exigirTamano(pfx: Uint8Array): void {
  if (pfx.byteLength === 0 || pfx.byteLength > BYTES_MAXIMOS_CERTIFICADO) {
    throw new ArchivoCertificadoInvalidoError(`El certificado debe pesar de 1 byte a ${KB_MAXIMOS_CERTIFICADO} KB`);
  }
}

/**
 * TR-RF-052, paso 3: valida la clave, el RUC y la vigencia del .pfx y lo guarda con su clave en la bóveda, en una
 * transacción. Primero se configura el proveedor (`ConfigurarEmisor`). Un certificado rechazado no toca el emisor
 * ni la bóveda (TR-CA-134).
 */
export class CargarCertificado {
  constructor(private readonly dependencias: DependenciasEmisor) {}

  async ejecutar(comando: CargarCertificadoComando): Promise<VistaEmisor> {
    const { unidadDeTrabajo, contexto, reloj, empresas, proveedores, emisores, lector, publicador, auditoria } = this.dependencias;
    exigirTamano(comando.pfx);
    const actorId = actorDe(contexto);
    const certificadoLeido = lector.leer(comando.pfx, comando.clave);

    return unidadDeTrabajo.run(async () => {
      const empresa = await empresas.obtener(comando.empresaId);
      if (!empresa.activa) throw new EmpresaInactivaError();
      const emisor = await emisores.porEmpresa(empresa.id);
      if (!emisor) throw new EmisorNoEncontradoError();
      const ahora = reloj.now();
      certificadoLeido.validarPara(empresa.ruc, ahora);
      const proveedor = await proveedores.obtener(emisor.proveedor);
      const antes = datosPublicos(emisor.certificado);
      const versionLeida = emisor.version;

      emisor.asignarCertificado(certificadoLeido, await this.guardarSecretos(emisor, comando));
      const pasoAConfigurado = emisor.recalcularEstado(proveedor.requiereCertificado, ahora);
      emisor.registrarModificacion(actorId, ahora);
      await emisores.actualizar(emisor, versionLeida);
      if (pasoAConfigurado) await publicador.publish(emisorConfigurado(emisor.version, emisor.cargaConfigurado(), ahora));

      await auditoria.registrar({
        accion: ACCIONES_EMISOR.cargarCertificado,
        entidadTipo: ENTIDAD_EMISOR,
        entidadId: emisor.id,
        antes,
        despues: datosPublicos(emisor.certificado),
      });
      return vistaDe(emisor);
    });
  }

  /** Reemplazar el certificado rota los mismos dos secretos (misma id, versión + 1). */
  private async guardarSecretos(emisor: Emisor, comando: CargarCertificadoComando): Promise<SecretosCertificado> {
    const { boveda } = this.dependencias;
    const actuales = emisor.secretosCertificado;
    return {
      certificadoId: await guardarORotar(boveda, actuales?.certificadoId ?? null, TIPOS_SECRETO_FE.certificado, comando.pfx),
      claveId: await guardarORotar(boveda, actuales?.claveId ?? null, TIPOS_SECRETO_FE.claveCertificado, bytesDe(comando.clave)),
    };
  }
}
