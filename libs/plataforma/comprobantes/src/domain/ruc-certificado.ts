import { CertificadoSinRucError } from './errores.js';

/** Atributo del sujeto X.509 por su nombre largo (`serialNumber`) o corto (`OU`, `CN`, `O`). */
export interface AtributoSujeto {
  nombre?: string;
  nombreCorto?: string;
  valor: string;
}

/** Las entidades certificadoras peruanas no ponen el RUC en el mismo atributo: se busca en este orden. */
const ATRIBUTOS_CON_RUC = ['serialNumber', 'OU', 'CN', 'O'] as const;
/** Persona natural (10), entidades (15, 17) y persona jurídica (20), sin otros dígitos pegados. */
const RUC_EN_TEXTO = /(?<!\d)(?:10|15|17|20)\d{9}(?!\d)/;

function valoresDe(atributos: readonly AtributoSujeto[], nombre: string): string[] {
  return atributos.filter((atributo) => atributo.nombre === nombre || atributo.nombreCorto === nombre).map((atributo) => atributo.valor);
}

export function extraerRuc(atributos: readonly AtributoSujeto[]): string {
  for (const nombre of ATRIBUTOS_CON_RUC) {
    for (const valor of valoresDe(atributos, nombre)) {
      const encontrado = RUC_EN_TEXTO.exec(valor);
      if (encontrado) return encontrado[0];
    }
  }
  throw new CertificadoSinRucError();
}
