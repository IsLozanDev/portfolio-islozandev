import type { Denominacion, TipoDocumento } from '../models/persona';

/** Natural: «Quispe Mamani, Juana»; jurídica: la razón social. Igual que la `denominacion` del listado. */
export function denominacionDe(denominacion: Denominacion): string {
  if (denominacion.razonSocial !== null) return denominacion.razonSocial;
  const apellidos = [denominacion.apellidoPaterno, denominacion.apellidoMaterno].filter((apellido) => apellido !== null).join(' ');
  return `${apellidos}, ${denominacion.nombres ?? ''}`;
}

/** En orden de lectura, para un botón: «Juana Quispe Mamani» o la razón social. */
export function nombreCompletoDe(denominacion: Denominacion): string {
  if (denominacion.razonSocial !== null) return denominacion.razonSocial;
  return [denominacion.nombres, denominacion.apellidoPaterno, denominacion.apellidoMaterno].filter((parte) => parte !== null).join(' ');
}

/** Dos letras para el avatar: nombre y apellido, o el inicio de la razón social. */
export function inicialesDe(denominacion: Denominacion): string {
  if (denominacion.razonSocial !== null) return denominacion.razonSocial.slice(0, 2).toUpperCase();
  return `${denominacion.nombres?.[0] ?? ''}${denominacion.apellidoPaterno?.[0] ?? ''}`.toUpperCase();
}

/** Las iniciales de una denominación ya armada del listado. */
export function inicialesDeTexto(denominacion: string): string {
  const [apellidos, nombres] = denominacion.split(', ');
  if (nombres === undefined) return denominacion.slice(0, 2).toUpperCase();
  return `${nombres[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

const RUC_JURIDICA = '20';

/** RUC 20… es de persona jurídica; el resto de documentos, de persona natural. */
export function esDocumentoDeJuridica(tipo: TipoDocumento, numero: string): boolean {
  return tipo === 'RUC' && numero.startsWith(RUC_JURIDICA);
}
