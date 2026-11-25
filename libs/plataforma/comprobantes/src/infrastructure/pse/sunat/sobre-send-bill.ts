import { ConstructorXml } from '../../sunat/ubl/constructor-xml.js';

const NAMESPACE_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NAMESPACE_SERVICIO = 'http://service.sunat.gob.pe';
const NAMESPACE_WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const TIPO_PASSWORD_TEXT = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText';
const EXTENSION_ZIP = '.zip';

export interface DatosSendBill {
  /** RUC + usuario secundario SOL (`usuarioWsSecurity`). */
  usuario: string;
  /** Clave SOL: solo vive en el cuerpo de la petición. */
  clave: string;
  /** `RUC-TIPO-SERIE-NUMERO`, sin extensión. */
  nombreArchivo: string;
  zipBase64: string;
}

/** Sobre SOAP 1.1 de `sendBill` con WS-Security `UsernameToken` (PasswordText). El serializador escapa la clave. */
export function armarSobreSendBill({ usuario, clave, nombreArchivo, zipBase64 }: DatosSendBill): string {
  const sobre = new ConstructorXml(NAMESPACE_SOAP, 'soapenv:Envelope', {
    soapenv: NAMESPACE_SOAP,
    ser: NAMESPACE_SERVICIO,
    wsse: NAMESPACE_WSSE,
  });
  const cabecera = sobre.agregar(sobre.raiz, 'soapenv:Header');
  const token = sobre.agregar(sobre.agregar(cabecera, 'wsse:Security'), 'wsse:UsernameToken');
  sobre.agregar(token, 'wsse:Username', usuario);
  sobre.agregar(token, 'wsse:Password', clave, { Type: TIPO_PASSWORD_TEXT });
  const envio = sobre.agregar(sobre.agregar(sobre.raiz, 'soapenv:Body'), 'ser:sendBill');
  sobre.agregar(envio, 'fileName', `${nombreArchivo}${EXTENSION_ZIP}`);
  sobre.agregar(envio, 'contentFile', zipBase64);
  return sobre.serializar();
}
