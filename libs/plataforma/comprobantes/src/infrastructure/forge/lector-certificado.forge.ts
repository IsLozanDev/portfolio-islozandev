import { createHash } from 'node:crypto';
import forge from 'node-forge';
import type { LectorCertificado } from '../../application/ports/lector-certificado.js';
import { CertificadoLeido } from '../../domain/certificado-leido.js';
import { ArchivoCertificadoInvalidoError, ClaveCertificadoIncorrectaError } from '../../domain/errores.js';
import { extraerRuc, type AtributoSujeto } from '../../domain/ruc-certificado.js';

const { asn1, pkcs12, pki, util } = forge;
const BOLSA_CERTIFICADO = pki.oids.certBag;
const BOLSAS_LLAVE = [pki.oids.pkcs8ShroudedKeyBag, pki.oids.keyBag];
/** node-forge falla así cuando la clave no verifica el MAC o no descifra las bolsas. */
const FALLA_DE_CLAVE = /MAC could not be verified|Invalid password|decrypt/i;

type Bolsa = forge.pkcs12.Bag;

function bolsasDe(contenedor: forge.pkcs12.Pkcs12Pfx, tipo: string): Bolsa[] {
  return contenedor.getBags({ bagType: tipo })[tipo] ?? [];
}

function idLlaveDe(bolsa: Bolsa): string | null {
  const [idLlave] = (bolsa.attributes?.localKeyId as string[] | undefined) ?? [];
  return idLlave ?? null;
}

function moduloDe(llave: unknown): string | null {
  const modulo = (llave as { n?: { toString(base: number): string } } | null)?.n;
  return modulo ? modulo.toString(16) : null;
}

/** La llave privada del contenedor y su certificado hoja. */
export interface ParDeLlave {
  llave: forge.pki.PrivateKey;
  certificado: forge.pki.Certificate;
}

/** El certificado hoja es el de la llave privada: por `localKeyId` y, si falta, por el módulo RSA. */
function parDeLaLlave(contenedor: forge.pkcs12.Pkcs12Pfx): ParDeLlave {
  const [llave] = BOLSAS_LLAVE.flatMap((tipo) => bolsasDe(contenedor, tipo));
  const certificados = bolsasDe(contenedor, BOLSA_CERTIFICADO).filter((bolsa) => bolsa.cert);
  if (!llave?.key || certificados.length === 0) throw new ArchivoCertificadoInvalidoError();
  const idLlave = idLlaveDe(llave);
  const moduloLlave = moduloDe(llave.key);
  const hoja = certificados.find(
    (bolsa) =>
      (idLlave !== null && idLlaveDe(bolsa) === idLlave) ||
      (moduloLlave !== null && moduloDe(bolsa.cert?.publicKey) === moduloLlave),
  );
  if (!hoja?.cert) throw new ArchivoCertificadoInvalidoError();
  return { llave: llave.key, certificado: hoja.cert };
}

function abrir(pfx: Uint8Array, clave: string): forge.pkcs12.Pkcs12Pfx {
  let estructura: forge.asn1.Asn1;
  try {
    estructura = asn1.fromDer(util.createBuffer(util.binary.raw.encode(pfx)));
  } catch {
    throw new ArchivoCertificadoInvalidoError();
  }
  try {
    return pkcs12.pkcs12FromAsn1(estructura, clave);
  } catch (error) {
    // Sin el mensaje de node-forge en el error propio: no hace falta y no se arriesga a filtrar nada.
    if (error instanceof Error && FALLA_DE_CLAVE.test(error.message)) throw new ClaveCertificadoIncorrectaError();
    throw new ArchivoCertificadoInvalidoError();
  }
}

/**
 * Abre el PKCS#12 y devuelve la llave privada con su certificado hoja. ClaveCertificadoIncorrectaError o
 * ArchivoCertificadoInvalidoError, sin la clave ni el mensaje de node-forge.
 */
export function abrirParDeLlave(pfx: Uint8Array, clave: string): ParDeLlave {
  return parDeLaLlave(abrir(pfx, clave));
}

function atributosDe(certificado: forge.pki.Certificate): AtributoSujeto[] {
  return certificado.subject.attributes.map((atributo) => ({
    nombre: atributo.name,
    nombreCorto: atributo.shortName,
    valor: String(atributo.value ?? ''),
  }));
}

function huellaDe(certificado: forge.pki.Certificate): string {
  const der = asn1.toDer(pki.certificateToAsn1(certificado)).getBytes();
  return createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex');
}

/** PKCS#12 con node-forge (JS puro, sin archivos temporales): abre PBES2/AES y 3DES con MAC SHA-1 o SHA-256. */
export class LectorCertificadoForge implements LectorCertificado {
  leer(pfx: Uint8Array, clave: string): CertificadoLeido {
    const { certificado } = abrirParDeLlave(pfx, clave);
    const sujeto = atributosDe(certificado);
    return new CertificadoLeido(extraerRuc(sujeto), certificado.validity.notAfter, certificado.validity.notBefore, huellaDe(certificado), sujeto);
  }
}
