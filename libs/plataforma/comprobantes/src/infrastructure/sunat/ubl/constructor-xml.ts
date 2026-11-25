import { DOMImplementation, XMLSerializer, type Document, type Element } from '@xmldom/xmldom';

export const NAMESPACE_XMLNS = 'http://www.w3.org/2000/xmlns/';
const DECLARACION_XML = 'version="1.0" encoding="UTF-8"';

export type Atributos = Readonly<Record<string, string>>;

/** Prefijo → namespace de los nodos que crea el documento. */
export type Namespaces = Readonly<Record<string, string>>;

/**
 * DOM con prefijos declarados en la raíz. El texto lo escapa el serializador (`&`, `<` en descripciones y nombres),
 * sin depender de cada llamador.
 */
export class ConstructorXml {
  private readonly documento: Document;

  constructor(
    namespaceRaiz: string,
    nombreRaiz: string,
    private readonly namespaces: Namespaces,
  ) {
    this.documento = new DOMImplementation().createDocument(namespaceRaiz, nombreRaiz, null);
    this.documento.insertBefore(this.documento.createProcessingInstruction('xml', DECLARACION_XML), this.documento.documentElement);
    for (const [prefijo, namespace] of Object.entries(namespaces)) {
      this.raiz.setAttributeNS(NAMESPACE_XMLNS, `xmlns:${prefijo}`, namespace);
    }
  }

  get raiz(): Element {
    const raiz = this.documento.documentElement;
    if (!raiz) throw new Error('El documento XML no tiene raíz');
    return raiz;
  }

  /** `nombre` con prefijo («cbc:ID»); el texto y los atributos son opcionales. */
  agregar(padre: Element, nombre: string, texto?: string, atributos: Atributos = {}): Element {
    const [prefijo] = nombre.split(':');
    const elemento = this.documento.createElementNS(this.namespaces[prefijo], nombre);
    for (const [atributo, valor] of Object.entries(atributos)) elemento.setAttribute(atributo, valor);
    if (texto !== undefined) elemento.appendChild(this.documento.createTextNode(texto));
    padre.appendChild(elemento);
    return elemento;
  }

  serializar(): string {
    return new XMLSerializer().serializeToString(this.documento);
  }
}
