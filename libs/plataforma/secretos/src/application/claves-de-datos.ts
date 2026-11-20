import type { ClavesMaestras } from '../domain/claves-maestras.js';
import { datosAsociadosClave } from '../domain/datos-asociados.js';
import { BovedaNoConfiguradaError } from '../domain/errores.js';
import type { Cifrador } from './ports/cifrador.js';
import type { ClaveTenantGuardada, RepositorioClavesTenant } from './ports/repositorio-claves-tenant.js';

/**
 * El sobre de la clave de datos del tenant del contexto: se envuelve con la maestra activa y se desenvuelve con la
 * versión que indica su fila. Sin claves maestras configuradas, cada uso falla con BovedaNoConfiguradaError.
 */
export class ClavesDeDatos {
  constructor(
    private readonly cifrador: Cifrador,
    private readonly clavesTenant: RepositorioClavesTenant,
    private readonly clavesMaestras: ClavesMaestras | undefined,
  ) {}

  exigirMaestras(): ClavesMaestras {
    if (!this.clavesMaestras) throw new BovedaNoConfiguradaError();
    return this.clavesMaestras;
  }

  /** La del tenant; en su primer secreto la crea, envuelta con la activa. */
  async obtenerOCrear(tenantId: string): Promise<Uint8Array> {
    const existente = await this.clavesTenant.obtener();
    if (existente) return this.desenvolver(existente);
    const nueva = this.envolver(tenantId, this.cifrador.claveAleatoria(), null);
    return this.desenvolver(await this.clavesTenant.crearSiNoExiste(nueva));
  }

  /** La del tenant de un secreto que existe: la FK de sec.secreto garantiza que está. */
  async obtenerExistente(): Promise<Uint8Array> {
    const existente = await this.clavesTenant.obtener();
    if (!existente) throw new Error('El tenant tiene secretos sin clave de datos');
    return this.desenvolver(existente);
  }

  /** ClaveMaestraDesconocidaError si su versión de maestra no está configurada; SecretoCorruptoError si no descifra. */
  desenvolver(clave: ClaveTenantGuardada): Uint8Array {
    const maestra = this.exigirMaestras().clave(clave.versionClaveMaestra);
    return this.cifrador.descifrar(maestra, clave.claveCifrada, clave.iv, datosAsociadosClave(clave.tenantId, clave.versionClaveMaestra));
  }

  envolver(tenantId: string, claveDatos: Uint8Array, reenvueltaEn: Date | null): ClaveTenantGuardada {
    const maestras = this.exigirMaestras();
    const { activa } = maestras;
    const { cifrado, iv } = this.cifrador.cifrar(maestras.claveActiva(), claveDatos, datosAsociadosClave(tenantId, activa));
    return { tenantId, claveCifrada: cifrado, iv, versionClaveMaestra: activa, reenvueltaEn };
  }
}
