import { generateKeyPairSync, randomBytes } from 'node:crypto';
import forge from 'node-forge';

export const RUC_EMPRESA = '20601234561';
export const OTRO_RUC = '20512345678';
export const CLAVE_PFX = 'clave-del-pfx-123';
const DIA_MS = 86_400_000;
const DIAS_DE_VIGENCIA = 365;
const BYTES_NUMERO_DE_SERIE = 8;
/** Como un certificado real; node:crypto la genera rápido (node-forge en JS puro tardaría segundos). */
const BITS_RSA = 2048;

export interface OpcionesCertificado {
  /** Atributos del sujeto en orden; por defecto el RUC va en `serialNumber`. */
  sujeto?: forge.pki.CertificateField[];
  emitidoEn?: Date;
  venceEn?: Date;
  clave?: string;
  /** `aes256` cifra con PBES2 (como OpenSSL 3); `3des`, como los .pfx antiguos. */
  algoritmo?: 'aes256' | '3des';
  /** Otro certificado sin su llave en el contenedor (la cadena de la entidad certificadora). */
  conCadena?: boolean;
}

export const sujetoConRuc = (ruc: string): forge.pki.CertificateField[] => [
  { name: 'countryName', value: 'PE' },
  { name: 'organizationName', value: 'EMPRESA DE PRUEBA SAC' },
  { name: 'serialNumber', value: ruc },
  { name: 'commonName', value: 'JUAN PEREZ' },
];

function llaves(): { privada: forge.pki.rsa.PrivateKey; publica: forge.pki.rsa.PublicKey } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: BITS_RSA });
  return {
    privada: forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()),
    publica: forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }).toString()),
  };
}

function certificado(sujeto: forge.pki.CertificateField[], emitidoEn: Date, venceEn: Date) {
  const { privada, publica } = llaves();
  const certificadoX509 = forge.pki.createCertificate();
  certificadoX509.publicKey = publica;
  certificadoX509.serialNumber = `01${randomBytes(BYTES_NUMERO_DE_SERIE).toString('hex')}`;
  certificadoX509.validity.notBefore = emitidoEn;
  certificadoX509.validity.notAfter = venceEn;
  certificadoX509.setSubject(sujeto);
  certificadoX509.setIssuer([{ name: 'commonName', value: 'EC de prueba' }]);
  certificadoX509.sign(privada, forge.md.sha256.create());
  return { certificadoX509, privada };
}

/** Un .pfx con un certificado hoja y su llave, firmado por sí mismo. */
export function crearPfx(ahora: Date, opciones: OpcionesCertificado = {}): Uint8Array {
  const emitidoEn = opciones.emitidoEn ?? enDias(ahora, -1);
  const venceEn = opciones.venceEn ?? enDias(ahora, DIAS_DE_VIGENCIA);
  const hoja = certificado(opciones.sujeto ?? sujetoConRuc(RUC_EMPRESA), emitidoEn, venceEn);
  const cadena = opciones.conCadena ? [certificado([{ name: 'commonName', value: 'EC raíz' }], emitidoEn, venceEn).certificadoX509] : [];
  const asn1 = forge.pkcs12.toPkcs12Asn1(hoja.privada, [hoja.certificadoX509, ...cadena], opciones.clave ?? CLAVE_PFX, {
    algorithm: opciones.algoritmo ?? 'aes256',
  });
  return Uint8Array.from(Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'));
}

export const enDias = (ahora: Date, dias: number): Date => new Date(ahora.getTime() + dias * DIA_MS);

export const textoPlano = (): Uint8Array => new TextEncoder().encode('esto no es un certificado\n');

export const bytesAleatorios = (cantidad: number): Uint8Array => Uint8Array.from(randomBytes(cantidad));
