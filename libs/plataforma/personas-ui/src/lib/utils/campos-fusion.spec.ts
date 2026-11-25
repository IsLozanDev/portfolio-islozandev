import { DETALLE_DE_PRUEBA } from '../../testing/persona-de-prueba';
import type { ComparacionPar } from '../models/duplicados';
import { ErrorPersonas } from '../models/error-personas';
import { mensajeDeErrorDuplicados, motivosDe } from '../models/mensajes-duplicados';
import { aPersonaDetalle, type PersonaDetalle } from '../models/persona';
import { conservadaSugerida, eleccionInicial, opcionesDatosBasicos, opcionesPrincipales, solicitudDe } from './campos-fusion';

const UBIGEO_CAYMA = { ubigeo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA', referencia: null };

/** TR-CA-107 adaptado: Juana con DNI y la misma Juana con pasaporte y el mismo celular. */
const JUANA_DNI: PersonaDetalle = aPersonaDetalle({
  ...DETALLE_DE_PRUEBA,
  id: 'per-a',
  version: 3,
  contactos: [
    { id: 'a-cel', tipo: 'CELULAR', valor: '987654321', principal: true },
    { id: 'a-cor', tipo: 'CORREO', valor: 'juana.quispe@correo.pe', principal: true },
  ],
  direcciones: [{ id: 'a-d1', direccion: 'Av. Ejército 710', principal: true, ...UBIGEO_CAYMA }],
});
const JUANA_PASAPORTE: PersonaDetalle = aPersonaDetalle({
  ...DETALLE_DE_PRUEBA,
  id: 'per-b',
  tipo_documento: 'PASAPORTE',
  numero_documento: '118204573',
  apellido_materno: null,
  version: 1,
  contactos: [
    { id: 'b-cel', tipo: 'CELULAR', valor: '987654321', principal: true },
    { id: 'b-cel2', tipo: 'CELULAR', valor: '958123447', principal: false },
    { id: 'b-fijo', tipo: 'FIJO', valor: '054223344', principal: true },
  ],
  direcciones: [
    { id: 'b-d1', direccion: 'av ejercito 710', principal: true, ...UBIGEO_CAYMA },
    { id: 'b-d2', direccion: 'Calle Mercaderes 214', principal: false, ...UBIGEO_CAYMA, ubigeo: '040101', distrito: 'AREQUIPA' },
  ],
});
const COMPARACION: ComparacionPar = {
  personaA: JUANA_DNI,
  personaB: JUANA_PASAPORTE,
  puntaje: 60,
  motivos: ['CELULAR_Y_NOMBRE_PARECIDO'],
  descartado: false,
  bloqueo: null,
};

describe('campos de la fusión', () => {
  it('conservadaSugerida prefiere DNI sobre pasaporte en cualquier orden y, si empatan, la ficha A', () => {
    expect(conservadaSugerida(JUANA_DNI, JUANA_PASAPORTE).id).toBe('per-a');
    expect(conservadaSugerida(JUANA_PASAPORTE, JUANA_DNI).id).toBe('per-a');
    const otroDni = { ...JUANA_DNI, id: 'per-c' };
    expect(conservadaSugerida(otroDni, JUANA_DNI).id).toBe('per-c');
    expect(conservadaSugerida(JUANA_PASAPORTE, { ...JUANA_PASAPORTE, id: 'per-d' }).id).toBe('per-b');
  });

  it('eleccionInicial toma los datos de la conservada y su principal, o el de la absorbida si no tiene', () => {
    expect(eleccionInicial(JUANA_DNI, JUANA_PASAPORTE)).toEqual({
      conservadaId: 'per-a',
      datosBasicos: { nombres: 'CONSERVADA', apellidoPaterno: 'CONSERVADA', apellidoMaterno: 'CONSERVADA' },
      principales: { CELULAR: 'a-cel', CORREO: 'a-cor', FIJO: 'b-fijo', DIRECCION: 'a-d1' },
    });
  });

  it('opcionesDatosBasicos marca iguales sin tildes ni mayúsculas y solo los campos del tipo de persona', () => {
    const conTilde = { ...JUANA_PASAPORTE, nombres: 'JUÁNA' };
    expect(opcionesDatosBasicos(JUANA_DNI, conTilde)).toEqual([
      { campo: 'nombres', valorConservada: 'Juana', valorAbsorbida: 'JUÁNA', iguales: true },
      { campo: 'apellidoPaterno', valorConservada: 'Quispe', valorAbsorbida: 'Quispe', iguales: true },
      { campo: 'apellidoMaterno', valorConservada: 'Mamani', valorAbsorbida: null, iguales: false },
    ]);
    const juridica = { ...JUANA_DNI, tipoPersona: 'JURIDICA' as const, razonSocial: 'Misti E.I.R.L.' };
    expect(opcionesDatosBasicos(juridica, { ...juridica, razonSocial: 'Inversiones Misti' }).map((opcion) => opcion.campo)).toEqual(['razonSocial']);
  });

  it('opcionesPrincipales muestra una vez el celular y la dirección que están en las dos fichas', () => {
    const grupos = opcionesPrincipales(JUANA_DNI, JUANA_PASAPORTE);

    expect(grupos.map((grupo) => grupo.clave)).toEqual(['CELULAR', 'FIJO', 'CORREO', 'DIRECCION']);
    expect(grupos[0]?.candidatos).toEqual([
      { id: 'a-cel', texto: '987 654 321', personaId: 'per-a', enLasDos: true },
      { id: 'b-cel2', texto: '958 123 447', personaId: 'per-b', enLasDos: false },
    ]);
    expect(grupos[3]?.candidatos).toEqual([
      { id: 'a-d1', texto: 'Av. Ejército 710 · AREQUIPA / AREQUIPA / CAYMA', personaId: 'per-a', enLasDos: true },
      { id: 'b-d2', texto: 'Calle Mercaderes 214 · AREQUIPA / AREQUIPA / AREQUIPA', personaId: 'per-b', enLasDos: false },
    ]);
  });

  it('solicitudDe arma la absorbida, las versiones y el motivo recortado según la conservada elegida', () => {
    const eleccion = { ...eleccionInicial(JUANA_PASAPORTE, JUANA_DNI), principales: { CELULAR: 'b-cel2' } };

    expect(solicitudDe(eleccion, COMPARACION, '  Misma clienta registrada con pasaporte  ')).toEqual({
      conservadaId: 'per-b',
      absorbidaId: 'per-a',
      versionConservada: 1,
      versionAbsorbida: 3,
      datosBasicos: { nombres: 'CONSERVADA', apellidoPaterno: 'CONSERVADA', apellidoMaterno: 'CONSERVADA' },
      principales: { CELULAR: 'b-cel2' },
      motivo: 'Misma clienta registrada con pasaporte',
    });
  });

  it('los mensajes de duplicados traducen motivos y bloqueos, y el resto como en personas', () => {
    expect(motivosDe(['MISMO_NUMERO_OTRO_TIPO', 'CELULAR_Y_NOMBRE_IGUAL'])).toBe('Mismo número, otro tipo de documento, Mismo celular y nombre');
    expect(mensajeDeErrorDuplicados(new ErrorPersonas('DOCUMENTOS_DISTINTOS', 'x', 409))).toBe('Las personas tienen documentos distintos');
    expect(mensajeDeErrorDuplicados(new ErrorPersonas('VERSION_OBSOLETA', 'x', 409))).toBe('Una de las fichas cambió; se recargó la comparación');
    expect(mensajeDeErrorDuplicados(new ErrorPersonas('NO_ENCONTRADA', 'x', 404))).toBe('La persona no existe o no es de su organización.');
  });
});
