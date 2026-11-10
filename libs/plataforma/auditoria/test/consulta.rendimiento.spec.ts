import { SystemClock } from '@vitrina/plataforma/kernel-infra';
import { DirectorioSegTypeOrm } from '@vitrina/plataforma/seguridad';
import { ConsultarAuditoria } from '../src/application/consultar-auditoria.js';
import type { FiltroAuditoria, Paginacion } from '../src/domain/filtro-auditoria.js';
import { LecturaAuditoriaTypeOrm } from '../src/infrastructure/typeorm/lectura-auditoria.typeorm.js';
import { crearEntornoAuditoria, type EntornoAuditoria } from './support/entorno.js';
import { AlcanceActorDePrueba } from './support/seguridad-de-prueba.js';
import { crearSemilla } from './support/semilla-consulta.js';
import { describeConDb } from './support/temp-db.js';

/** TR-RNF-002: lista paginada p95 < 1,5 s con 100 000 filas por tenant. Se reporta; no se exige (desviación si no baja). */
const FILAS = 100_000;
const CONSULTAS = 20;
const PERCENTIL = 0.95;
const OBJETIVO_P95_MS = 1_500;
const SUCURSALES = 5;
const PERSONAS = 20;
const SIEMBRA_MS = 15 * 60_000;

describeConDb('Rendimiento de la lista de auditoría (spec 20b, TR-RNF-002)', () => {
  let entorno: EntornoAuditoria;

  beforeAll(() => crearEntornoAuditoria().then((creado) => (entorno = creado)));
  afterAll(() => entorno?.cerrar());

  it(
    `reporta el p95 de ${CONSULTAS} listas con filtros típicos sobre ${FILAS} filas`,
    async () => {
      const semilla = crearSemilla(entorno.dataSource);
      const { tenantId, empresaId } = await semilla.tenant();
      const sucursales = await Promise.all(Array.from({ length: SUCURSALES }, (_, indice) => semilla.sucursal(tenantId, empresaId, `S${indice}`, `Sucursal ${indice}`)));
      const personas: string[] = [];
      for (let indice = 0; indice < PERSONAS; indice += 1) personas.push(await semilla.persona(tenantId, `Persona ${indice}`, `persona${indice}.${tenantId}@prueba.pe`));

      // 100 000 filas en 92 días, repartidas entre sucursales, personas y 10 acciones. El trigger las encadena.
      await entorno.dataSource.query(
        `INSERT INTO aud.evento_auditoria (id, tenant_id, tipo, origen, accion, entidad_tipo, entidad_id, usuario_id, sucursal_id, despues, ocurrido_en)
         SELECT gen_random_uuid(), $1, 'OPERACION', 'DIRECTO', 'rest.venta.accion' || (serie % 10), 'venta', 'V-' || serie,
                ($2::uuid[])[1 + serie % ${PERSONAS}], ($3::uuid[])[1 + serie % ${SUCURSALES}], jsonb_build_object('total', serie),
                timestamptz '2026-08-01 05:00:00+00' + (serie * interval '79 seconds')
           FROM generate_series(1, ${FILAS}) AS serie`,
        [tenantId, personas, sucursales],
      );
      await entorno.dataSource.query('ANALYZE aud.evento_auditoria');

      const alcanceActor = new AlcanceActorDePrueba();
      const propietaria = personas[0];
      alcanceActor.tenant.add(propietaria);
      const consultar = new ConsultarAuditoria({
        unidadDeTrabajo: entorno.unidadDeTrabajo,
        contexto: entorno.contexto,
        reloj: new SystemClock(),
        alcanceActor,
        directorio: new DirectorioSegTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
        lectura: new LecturaAuditoriaTypeOrm(entorno.unidadDeTrabajo, entorno.contexto),
      });

      const rango = { desde: '2026-08-01', hasta: '2026-10-31' };
      const tipicas: { actor: string; filtro: FiltroAuditoria; pagina: Partial<Paginacion> }[] = [
        { actor: propietaria, filtro: rango, pagina: {} },
        { actor: propietaria, filtro: { desde: '2026-10-01', hasta: '2026-10-31' }, pagina: { pagina: 3 } },
        { actor: propietaria, filtro: { ...rango, accion: 'rest.venta.accion3' }, pagina: {} },
        { actor: propietaria, filtro: { ...rango, sucursalId: sucursales[2] }, pagina: { tamano: 100 } },
        { actor: propietaria, filtro: { ...rango, usuario: 'persona7.' }, pagina: {} },
        { actor: personas[1], filtro: rango, pagina: {} },
        { actor: personas[1], filtro: { ...rango, accion: 'rest.venta.accion1' }, pagina: { pagina: 10 } },
      ];
      const duraciones: number[] = [];
      for (let indice = 0; indice < CONSULTAS; indice += 1) {
        const { actor, filtro, pagina } = tipicas[indice % tipicas.length];
        const inicio = performance.now();
        const listado = await entorno.contexto.run({ tenantId, actorId: actor, branchId: sucursales[1] }, () => consultar.ejecutar(filtro, pagina));
        duraciones.push(performance.now() - inicio);
        expect(listado.total).toBeGreaterThan(0);
      }

      const ordenadas = [...duraciones].sort((a, b) => a - b);
      const p95 = ordenadas[Math.ceil(PERCENTIL * ordenadas.length) - 1];
      const veredicto = p95 < OBJETIVO_P95_MS ? 'dentro del objetivo' : 'DESVIACIÓN: registrar en el spec';
      console.log(`[TR-RNF-002] lista de auditoría con ${FILAS} filas: p95 ${p95.toFixed(0)} ms en ${CONSULTAS} consultas (objetivo < ${OBJETIVO_P95_MS} ms, ${veredicto})`);
    },
    SIEMBRA_MS,
  );
});
