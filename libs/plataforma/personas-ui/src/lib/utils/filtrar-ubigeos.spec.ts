import type { Ubigeo } from '../models/ubigeo';
import { filtrarUbigeos } from './filtrar-ubigeos';
import { formatoUbigeo } from './formato-ubigeo';

const CAYMA: Ubigeo = { codigo: '040103', distrito: 'CAYMA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const CERCADO: Ubigeo = { codigo: '040101', distrito: 'AREQUIPA', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const MIRAFLORES_AQP: Ubigeo = { codigo: '040110', distrito: 'MIRAFLORES', provincia: 'AREQUIPA', departamento: 'AREQUIPA' };
const MIRAFLORES_LIMA: Ubigeo = { codigo: '150122', distrito: 'MIRAFLORES', provincia: 'LIMA', departamento: 'LIMA' };
const ANCON: Ubigeo = { codigo: '150102', distrito: 'ANCÓN', provincia: 'LIMA', departamento: 'LIMA' };
const UBIGEOS = [CERCADO, CAYMA, MIRAFLORES_AQP, MIRAFLORES_LIMA, ANCON];

describe('formatoUbigeo', () => {
  it('TR-CA-105: departamento / provincia / distrito, como en el catálogo', () => {
    expect(formatoUbigeo(CAYMA)).toBe('AREQUIPA / AREQUIPA / CAYMA');
  });
});

describe('filtrarUbigeos', () => {
  it('encuentra por distrito y por varias palabras en cualquier campo', () => {
    expect(filtrarUbigeos(UBIGEOS, 'cayma')).toEqual([CAYMA]);
    expect(filtrarUbigeos(UBIGEOS, 'arequipa caym')).toEqual([CAYMA]);
    expect(filtrarUbigeos(UBIGEOS, 'miraflores lima')).toEqual([MIRAFLORES_LIMA]);
  });

  it('sin tildes y sin mayúsculas', () => {
    expect(filtrarUbigeos(UBIGEOS, 'ancon')).toEqual([ANCON]);
  });

  it('primero los distritos que empiezan como lo escrito', () => {
    expect(filtrarUbigeos(UBIGEOS, 'arequipa')[0]).toBe(CERCADO);
  });

  it('un distrito repetido en dos departamentos sale dos veces, para elegir', () => {
    expect(filtrarUbigeos(UBIGEOS, 'miraflores')).toEqual([MIRAFLORES_AQP, MIRAFLORES_LIMA]);
  });

  it('vacío no devuelve nada y respeta el máximo', () => {
    expect(filtrarUbigeos(UBIGEOS, '  ')).toEqual([]);
    expect(filtrarUbigeos(UBIGEOS, 'a', 2)).toHaveLength(2);
  });
});
