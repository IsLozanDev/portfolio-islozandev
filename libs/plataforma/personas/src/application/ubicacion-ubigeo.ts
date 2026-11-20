import type { CatalogoPort } from '@vitrina/plataforma/catalogos';
import { CATALOGO_UBIGEO, exigirFormatoDeUbigeo, type UbicacionUbigeo } from '../domain/direccion.js';
import { UbigeoNoVigenteError } from '../domain/errores.js';

/**
 * Distrito, provincia y departamento de un ubigeo vigente, como están en el catálogo `UBIGEO`: el distrito
 * es el nombre del ítem y los otros dos son atributos.
 */
export async function resolverUbicacion(catalogo: Pick<CatalogoPort, 'validarItem'>, ubigeo: string): Promise<UbicacionUbigeo> {
  exigirFormatoDeUbigeo(ubigeo);
  const { valido, nombre, atributos } = await catalogo.validarItem(CATALOGO_UBIGEO, ubigeo);
  const provincia = atributos?.['provincia'];
  const departamento = atributos?.['departamento'];
  if (!valido || !esTextoNoVacio(nombre) || !esTextoNoVacio(provincia) || !esTextoNoVacio(departamento)) {
    throw new UbigeoNoVigenteError();
  }
  return { distrito: nombre, provincia, departamento };
}

function esTextoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== '';
}
