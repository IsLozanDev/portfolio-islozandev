import { reglaDeCategoria, tiposPermitidos } from './tipos-archivo';

describe('tipos de archivo', () => {
  it('nombra los MIME conocidos y usa el subtipo para los demás', () => {
    const categoria = { codigo: 'X', mimesPermitidos: ['application/pdf', 'image/jpeg', 'image/avif'], tamanoMaxBytes: 1 };
    expect(tiposPermitidos(categoria)).toBe('PDF, JPG o AVIF');
  });

  it('la regla junta los tipos y el máximo', () => {
    const documento = {
      codigo: 'DOCUMENTO',
      mimesPermitidos: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg'],
      tamanoMaxBytes: 26214400,
    };
    expect(reglaDeCategoria(documento)).toBe('PDF, DOCX o JPG · hasta 25 MB');
  });
});
