import type { BovedaSecretos } from '@vitrina/plataforma/secretos';
import type { Emisor } from '../domain/emisor.js';
import type { ProveedorFe } from './ports/proveedores-fe.js';
import type { CredencialesPse } from './ports/pse-ose.port.js';

const decodificador = new TextDecoder();

/**
 * El token (o la clave SOL) y, si el proveedor lo requiere, el .pfx y su clave, leídos de la bóveda solo en el
 * worker al enviar (la prueba del spec 50 y el envío del 52). No salen del adaptador ni se registran.
 */
export async function credencialesDelEmisor(
  emisor: Emisor,
  secretoCredencialId: string,
  url: string | null,
  proveedor: ProveedorFe,
  boveda: Pick<BovedaSecretos, 'leer'>,
): Promise<CredencialesPse> {
  const token = decodificador.decode(await boveda.leer(secretoCredencialId));
  const credenciales: CredencialesPse = { url, usuario: emisor.usuarioProveedor, token, ambiente: emisor.ambiente };
  if (!proveedor.requiereCertificado) return credenciales;
  const certificado = await certificadoDe(emisor, boveda);
  return certificado ? { ...credenciales, certificado } : credenciales;
}

async function certificadoDe(emisor: Emisor, boveda: Pick<BovedaSecretos, 'leer'>): Promise<CredencialesPse['certificado']> {
  const secretos = emisor.secretosCertificado;
  if (secretos === null) return undefined;
  return { pfx: await boveda.leer(secretos.certificadoId), clave: decodificador.decode(await boveda.leer(secretos.claveId)) };
}
