import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';
import { crearVerificacionReal } from './support/verificacion-real.js';

/** TR-RNF-112: verificación < 15 min por tenant. Se reporta la completa; no se exige (desviación si no baja). */
const FILAS = 100_000;
const OBJETIVO_MS = 15 * 60_000;
const LIMITE_PRUEBA_MS = 30 * 60_000;

describeConDb('Rendimiento de la verificación de integridad (spec 20b, TR-RNF-112)', () => {
  let entorno: EntornoAuditoria;

  beforeAll(() => crearEntornoAuditoria().then((creado) => (entorno = creado)));
  afterAll(() => entorno?.cerrar());

  it(
    `reporta la duración de la verificación completa de ${FILAS} filas`,
    async () => {
      const real = crearVerificacionReal(entorno);
      const tenantId = await real.cadena(FILAS);

      const inicio = performance.now();
      const verificacion = await real.verificar.ejecutar(tenantId, 'COMPLETA');
      const duracionMs = performance.now() - inicio;

      expect(verificacion).toMatchObject({ estado: 'OK', hastaNumero: String(FILAS), filas: FILAS });
      const veredicto = duracionMs < OBJETIVO_MS ? 'dentro del objetivo' : 'DESVIACIÓN: registrar en el spec';
      console.log(`[TR-RNF-112] verificación completa de ${FILAS} filas: ${(duracionMs / 1000).toFixed(1)} s (objetivo < 15 min, ${veredicto})`);
    },
    LIMITE_PRUEBA_MS,
  );
});
