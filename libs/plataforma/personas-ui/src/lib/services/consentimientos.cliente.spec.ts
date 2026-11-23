import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_URL, prepararHttpDePrueba } from '../../testing/http-de-prueba';
import { PERSONA_DE_PRUEBA } from '../../testing/persona-de-prueba';
import { ConsentimientosCliente } from './consentimientos.cliente';

describe('ConsentimientosCliente', () => {
  let cliente: ConsentimientosCliente;
  let http: HttpTestingController;

  beforeEach(() => {
    http = prepararHttpDePrueba();
    cliente = TestBed.inject(ConsentimientosCliente);
  });

  afterEach(() => http.verify());

  it('solo las finalidades decididas; una revocada sale como REVOCADO con su fecha y canal', async () => {
    const promesa = cliente.vigentes(PERSONA_DE_PRUEBA);
    http.expectOne({ method: 'GET', url: `${API_URL}/personas/${PERSONA_DE_PRUEBA}/consentimientos` }).flush({
      persona_id: PERSONA_DE_PRUEBA,
      vigentes: [
        {
          finalidad: 'PRESTACION',
          decision: { id: 'k1', finalidad: 'PRESTACION', decision: 'ACEPTA', version_texto: '2026-03', canal: 'PRESENCIAL', registrado_en: '2026-03-02T14:15:00Z' },
        },
        { finalidad: 'PROMOCIONES', decision: null },
        {
          finalidad: 'COMPARTIR_PRODUCTOS',
          decision: {
            id: 'k2', finalidad: 'COMPARTIR_PRODUCTOS', decision: 'ACEPTA', version_texto: '2026-03', canal: 'PRESENCIAL',
            registrado_en: '2026-03-02T14:16:00Z', revocado_en: '2026-10-20T23:40:00Z', canal_revocacion: 'WHATSAPP',
          },
        },
      ],
    });

    expect(await promesa).toEqual([
      { finalidad: 'PRESTACION', estado: 'ACEPTA', versionTexto: '2026-03', canal: 'PRESENCIAL', fecha: '2026-03-02T14:15:00Z' },
      { finalidad: 'COMPARTIR_PRODUCTOS', estado: 'REVOCADO', versionTexto: '2026-03', canal: 'WHATSAPP', fecha: '2026-10-20T23:40:00Z' },
    ]);
  });
});
