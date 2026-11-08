import { TestBed } from '@angular/core/testing';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { AdaptadorFechaPeru } from './adaptador-fecha-peru.service';

describe('AdaptadorFechaPeru', () => {
  let adaptador: AdaptadorFechaPeru;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AdaptadorFechaPeru, { provide: MAT_DATE_LOCALE, useValue: 'es-PE' }] });
    adaptador = TestBed.inject(AdaptadorFechaPeru);
  });

  it('lee dd/MM/yyyy como día y mes de Perú', () => {
    expect(adaptador.parse('27/10/2026')).toEqual(new Date(2026, 9, 27));
    expect(adaptador.parse(' 5/1/2026 ')).toEqual(new Date(2026, 0, 5));
  });

  it('un día que no existe o otro formato es inválido; vacío es null', () => {
    expect(adaptador.isValid(adaptador.parse('31/02/2026') as Date)).toBe(false);
    expect(adaptador.isValid(adaptador.parse('2026-10-27') as Date)).toBe(false);
    expect(adaptador.parse('')).toBeNull();
  });

  it('muestra la fecha como dd/MM/yyyy', () => {
    expect(adaptador.format(new Date(2026, 9, 27), {})).toBe('27/10/2026');
  });
});
