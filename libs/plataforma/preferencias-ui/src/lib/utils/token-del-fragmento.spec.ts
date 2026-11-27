import { tokenDelFragmento } from './token-del-fragmento';

describe('tokenDelFragmento', () => {
  it('lee el token de t= en el fragmento', () => {
    expect(tokenDelFragmento('t=abc.def')).toBe('abc.def');
    expect(tokenDelFragmento('otro=1&t=abc.def')).toBe('abc.def');
  });

  it('sin fragmento, sin t o con t vacío → null', () => {
    expect(tokenDelFragmento(null)).toBeNull();
    expect(tokenDelFragmento('')).toBeNull();
    expect(tokenDelFragmento('x=1')).toBeNull();
    expect(tokenDelFragmento('t=')).toBeNull();
  });
});
