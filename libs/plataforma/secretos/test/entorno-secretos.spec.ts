import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ClaveMaestraInvalidaError } from '../src/domain/errores.js';
import { camposEntornoSecretos, clavesMaestrasDe, exigirClaveMaestraEnProduccion } from '../src/interface/entorno-secretos.js';

const esquema = z
  .object({ APP_ENV: z.string().default('local'), ...camposEntornoSecretos })
  .superRefine(exigirClaveMaestraEnProduccion);

const claveBase64 = (bytes = 32) => randomBytes(bytes).toString('base64');
const UNO = claveBase64();
const DOS = claveBase64();

function problemas(entorno: Record<string, string | undefined>): string[] {
  const resultado = esquema.safeParse(entorno);
  return resultado.success ? [] : resultado.error.issues.map((problema) => `${problema.path.join('.')}: ${problema.message}`);
}

describe('entorno de la bóveda', () => {
  it('lee las versiones y la activa', () => {
    const entorno = esquema.parse({ SEC_CLAVES_MAESTRAS: `1:${UNO}; 2:${DOS}`, SEC_CLAVE_ACTIVA: '2' });

    const claves = clavesMaestrasDe(entorno);

    expect(claves?.versiones).toEqual([1, 2]);
    expect(claves?.activa).toBe(2);
    expect(Buffer.from(claves?.clave(1) ?? []).toString('base64')).toBe(UNO);
  });

  it('en local sin claves (o vacías) arranca y la bóveda queda sin configurar', () => {
    expect(problemas({})).toEqual([]);
    expect(problemas({ SEC_CLAVES_MAESTRAS: '', SEC_CLAVE_ACTIVA: '' })).toEqual([]);
    expect(clavesMaestrasDe(esquema.parse({ SEC_CLAVES_MAESTRAS: '', SEC_CLAVE_ACTIVA: '' }))).toBeUndefined();
  });

  it('en producción las dos son obligatorias', () => {
    expect(problemas({ APP_ENV: 'production' })).toEqual([
      'SEC_CLAVES_MAESTRAS: obligatoria en producción',
      'SEC_CLAVE_ACTIVA: obligatoria en producción',
    ]);
    expect(problemas({ APP_ENV: 'production', SEC_CLAVES_MAESTRAS: `1:${UNO}` })).toContain('SEC_CLAVE_ACTIVA: obligatoria en producción');
    expect(problemas({ APP_ENV: 'production', SEC_CLAVES_MAESTRAS: `1:${UNO}`, SEC_CLAVE_ACTIVA: '1' })).toEqual([]);
  });

  it.each([
    ['una clave que no decodifica a 32 bytes', `1:${claveBase64(16)}`, '1'],
    ['una activa ausente de la lista', `1:${UNO}`, '2'],
    ['una entrada sin versión', UNO, '1'],
    ['una versión no numérica', `v1:${UNO}`, '1'],
    ['un base64 inválido', '1:no-es-base64!', '1'],
    ['una versión repetida', `1:${UNO};1:${DOS}`, '1'],
    ['una versión cero', `0:${UNO}`, '0'],
  ])('en producción no arranca con %s, y el mensaje no trae la clave', (_caso, lista, activa) => {
    const encontrados = problemas({ APP_ENV: 'production', SEC_CLAVES_MAESTRAS: lista, SEC_CLAVE_ACTIVA: activa });

    expect(encontrados.length).toBeGreaterThan(0);
    expect(encontrados.join(' ')).not.toContain(UNO);
    expect(encontrados.join(' ')).not.toContain(DOS);
  });

  it('fuera de producción una lista mal escrita tampoco se acepta', () => {
    expect(problemas({ SEC_CLAVES_MAESTRAS: `1:${claveBase64(31)}`, SEC_CLAVE_ACTIVA: '1' })).toHaveLength(1);
    expect(problemas({ SEC_CLAVES_MAESTRAS: `1:${UNO}` })).toEqual(['SEC_CLAVES_MAESTRAS: SEC_CLAVES_MAESTRAS y SEC_CLAVE_ACTIVA van juntas']);
  });

  it('clavesMaestrasDe con solo una de las dos lanza ClaveMaestraInvalidaError', () => {
    expect(() => clavesMaestrasDe({ SEC_CLAVES_MAESTRAS: undefined, SEC_CLAVE_ACTIVA: 1 })).toThrow(ClaveMaestraInvalidaError);
  });
});
