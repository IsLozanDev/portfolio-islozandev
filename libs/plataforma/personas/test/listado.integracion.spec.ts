import { AlsTenantContext, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import type { ProductoCodigo } from '@vitrina/plataforma/org';
import { performance } from 'node:perf_hooks';
import { DataSource } from 'typeorm';
import type { CriteriosConsultaPersonas, PersonaListada } from '../src/application/ports/consulta-personas.js';
import { clasificarConsulta } from '../src/domain/consulta-personas.js';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad, type TipoDocumentoPersona } from '../src/domain/documento-identidad.js';
import { Persona, type TipoPersona } from '../src/domain/persona.js';
import type { RolPersona } from '../src/domain/rol-persona.js';
import { ConsultaPersonasTypeOrm } from '../src/infrastructure/typeorm/consulta-personas.typeorm.js';
import { ENTIDADES_PER } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioPersonasTypeOrm } from '../src/infrastructure/typeorm/personas.repositorio.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

const HOY = '2026-11-23';
/** La medición con 50 000 personas solo corre a pedido (local), no en CI. */
const MEDIR = process.env.MEDIR_BUSQUEDA_PERSONAS === '1';
const PERSONAS_MEDICION = 50_000;
const LIMITE_MS = 300;
const REPETICIONES_MEDICION = 5;

interface Semilla {
  tipoPersona: TipoPersona;
  tipoDocumento: TipoDocumentoPersona;
  numero: string;
  nombres?: string;
  paterno?: string;
  materno?: string;
  razonSocial?: string;
  celular: string;
  correo?: string;
  roles?: [ProductoCodigo, RolPersona][];
}

const JUANA: Semilla = {
  tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numero: '45781236', nombres: 'Juana', paterno: 'Quispe', materno: 'Mamani',
  celular: '987654321', correo: 'juana.quispe@correo.pe', roles: [['CLI', 'PACIENTE']],
};
const ROSA: Semilla = { tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numero: '40236718', nombres: 'Rosa', paterno: 'Valdivieso', materno: 'Chávez', celular: '956112430' };
const MARTHA: Semilla = {
  tipoPersona: 'NATURAL', tipoDocumento: 'CE', numero: '002345671', nombres: 'Martha', paterno: 'Jiménez', materno: 'Llerena',
  celular: '965432187', roles: [['CLI', 'PACIENTE']],
};
const CARLOS: Semilla = {
  tipoPersona: 'NATURAL', tipoDocumento: 'DNI', numero: '71234560', nombres: 'Carlos', paterno: 'Huamán', materno: 'Ccori',
  celular: '912345678', roles: [['GYM', 'SOCIO']],
};
const ANDINA: Semilla = {
  tipoPersona: 'JURIDICA', tipoDocumento: 'RUC', numero: '20601234565', razonSocial: 'Distribuidora Andina del Sur S.A.C.',
  celular: '974003120', roles: [['REST', 'PROVEEDOR']],
};

describeConDb('Listado y búsqueda de personas con TypeORM (spec 38, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let repositorio: RepositorioPersonasTypeOrm;
  let consulta: ConsultaPersonasTypeOrm;
  const tenantA = uuidV7();
  const tenantB = uuidV7();
  const ids = new Map<Semilla, string>();

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(trabajo));

  async function sembrar(tenantId: string, semilla: Semilla): Promise<string> {
    const persona = Persona.registrar({
      id: uuidV7(),
      tenantId,
      tipoPersona: semilla.tipoPersona,
      documento: DocumentoIdentidad.crear(semilla.tipoDocumento, semilla.numero),
      nombres: semilla.nombres,
      apellidoPaterno: semilla.paterno,
      apellidoMaterno: semilla.materno,
      razonSocial: semilla.razonSocial,
      contactos: [
        Contacto.crear({ id: uuidV7(), tipo: 'CELULAR', valor: semilla.celular, principal: true }),
        ...(semilla.correo ? [Contacto.crear({ id: uuidV7(), tipo: 'CORREO', valor: semilla.correo, principal: true })] : []),
      ],
    });
    for (const [producto, rol] of semilla.roles ?? []) persona.asignarRol(producto, rol, HOY);
    await enTenant(tenantId, () => repositorio.guardar(persona));
    return persona.id;
  }

  function buscar(q: string | undefined, extra: Partial<CriteriosConsultaPersonas> = {}, tenantId = tenantA) {
    return enTenant(tenantId, () => consulta.buscar({ consulta: clasificarConsulta(q), pagina: 1, tamano: 20, ...extra }));
  }

  async function idsDe(q: string | undefined, extra: Partial<CriteriosConsultaPersonas> = {}): Promise<string[]> {
    return (await buscar(q, extra)).items.map((item) => item.id);
  }

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_PER });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    repositorio = new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto);
    consulta = new ConsultaPersonasTypeOrm(unidadDeTrabajo, contexto);
    for (const semilla of [JUANA, ROSA, MARTHA, CARLOS, ANDINA]) ids.set(semilla, await sembrar(tenantA, semilla));
    // Otra Juana Quispe Mamani, en otro tenant: nunca aparece.
    await sembrar(tenantB, { ...JUANA, numero: '45781299' });
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('nombre sin tildes, sin mayúsculas y en cualquier orden', async () => {
    for (const q of ['quispe juana', 'QUISPE', 'Quíspe', 'mamani juana']) expect(await idsDe(q)).toEqual([ids.get(JUANA)]);
  });

  it('tolera errores de tipeo', async () => {
    expect(await idsDe('Qispe')).toContain(ids.get(JUANA));
    expect(await idsDe('Juanna')).toContain(ids.get(JUANA));
  });

  it('encuentra por cómo suena', async () => {
    expect(await idsDe('Baldiviezo')).toContain(ids.get(ROSA));
    expect(await idsDe('gimenes')).toContain(ids.get(MARTHA));
    expect(await idsDe('wuaman')).toContain(ids.get(CARLOS));
    expect(await idsDe('yerena')).toContain(ids.get(MARTHA));
  });

  it('documento por prefijo con coincidencia DOCUMENTO; el exacto va primero', async () => {
    const prefijo = await buscar('4578');
    expect(prefijo.items.map(({ id, coincidencia }) => ({ id, coincidencia }))).toEqual([{ id: ids.get(JUANA), coincidencia: 'DOCUMENTO' }]);
    expect((await buscar('45781236')).items[0]?.id).toBe(ids.get(JUANA));
  });

  it('celular por prefijo y correo, con coincidencia CONTACTO', async () => {
    const porCelular = await buscar('98765');
    expect(porCelular.items.map(({ id, coincidencia }) => ({ id, coincidencia }))).toEqual([{ id: ids.get(JUANA), coincidencia: 'CONTACTO' }]);
    expect(await idsDe('juana.quispe@')).toEqual([ids.get(JUANA)]);
  });

  it('cada ítem trae denominación, contactos principales y roles vigentes', async () => {
    const [juana] = (await buscar('quispe')).items as PersonaListada[];
    expect(juana).toEqual({
      id: ids.get(JUANA),
      tipoPersona: 'NATURAL',
      tipoDocumento: 'DNI',
      numeroDocumento: '45781236',
      nombres: 'Juana',
      apellidoPaterno: 'Quispe',
      apellidoMaterno: 'Mamani',
      razonSocial: null,
      celularPrincipal: '987654321',
      correoPrincipal: 'juana.quispe@correo.pe',
      roles: [{ productoCodigo: 'CLI', rol: 'PACIENTE' }],
      coincidencia: 'NOMBRE',
    });
  });

  it('filtra por producto y rol vigente, y por tipo de persona, también junto con el texto', async () => {
    expect((await idsDe(undefined, { producto: 'CLI', rol: 'PACIENTE' })).sort()).toEqual([ids.get(JUANA), ids.get(MARTHA)].sort());
    expect(await idsDe(undefined, { producto: 'GYM' })).toEqual([ids.get(CARLOS)]);
    expect(await idsDe(undefined, { rol: 'PROVEEDOR' })).toEqual([ids.get(ANDINA)]);
    expect(await idsDe(undefined, { tipoPersona: 'JURIDICA' })).toEqual([ids.get(ANDINA)]);
    expect(await idsDe('martha', { producto: 'CLI', rol: 'PACIENTE' })).toEqual([ids.get(MARTHA)]);
    expect(await idsDe('quispe', { producto: 'GYM' })).toEqual([]);
  });

  it('sin texto: por apellidos o razón social, paginado y con el total', async () => {
    const todas = await buscar(undefined);
    expect(todas.total).toBe(5);
    expect(todas.items.map((item) => item.id)).toEqual([ids.get(ANDINA), ids.get(CARLOS), ids.get(MARTHA), ids.get(JUANA), ids.get(ROSA)]);
    expect(todas.items.every((item) => item.coincidencia === null)).toBe(true);

    const segunda = await buscar(undefined, { pagina: 2, tamano: 2 });
    expect([segunda.total, segunda.items.map((item) => item.id)]).toEqual([5, [ids.get(MARTHA), ids.get(JUANA)]]);
  });

  it('una persona de otro tenant nunca aparece, aunque coincida', async () => {
    const enB = await buscar('quispe juana', {}, tenantB);
    expect(enB.total).toBe(1);
    expect(enB.items[0]?.numeroDocumento).toBe('45781299');
    expect((await buscar('45781299')).total).toBe(0);
  });

  it('el texto va como parámetro: una inyección solo se busca como texto', async () => {
    expect(await buscar("' OR 1=1 --")).toEqual({ items: [], total: 0 });
    expect(await buscar('100%_')).toEqual({ items: [], total: 0 });
  });

  (MEDIR ? it : it.skip)(`con ${PERSONAS_MEDICION} personas responde en menos de ${LIMITE_MS} ms`, async () => {
    const tenantMedicion = uuidV7();
    await dataSource.query(
      `INSERT INTO per.persona (id, tenant_id, tipo_persona, tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno)
       SELECT gen_random_uuid(), $1, 'NATURAL', 'DNI', lpad(serie::text, 8, '0'),
              (ARRAY['Juana', 'Carlos', 'Ana', 'Luis', 'Martha', 'Pedro', 'Rosa', 'Jorge'])[1 + serie % 8],
              (ARRAY['Quispe', 'Mamani', 'Condori', 'Huamán', 'Flores', 'Rojas', 'Apaza', 'Ccori', 'Yépez'])[1 + serie % 9] || serie % 997,
              (ARRAY['Gutiérrez', 'Cárdenas', 'Valdivieso', 'Llerena', 'Chávez'])[1 + serie % 5]
         FROM generate_series(1, $2::int) AS serie`,
      [tenantMedicion, PERSONAS_MEDICION],
    );
    await dataSource.query(
      `INSERT INTO per.contacto (id, persona_id, tenant_id, tipo_contacto, valor, principal)
       SELECT gen_random_uuid(), id, tenant_id, 'CELULAR', '9' || numero_documento, true FROM per.persona WHERE tenant_id = $1`,
      [tenantMedicion],
    );
    // Tras una carga masiva el autovacuum vacía la lista pendiente de los GIN; sin esto el planificador recorre el tenant.
    await dataSource.query('VACUUM ANALYZE per.persona');
    await dataSource.query('VACUUM ANALYZE per.contacto');

    const medir = async (q: string) => {
      await buscar(q, {}, tenantMedicion);
      const tiempos: number[] = [];
      for (let vez = 0; vez < REPETICIONES_MEDICION; vez++) {
        const inicio = performance.now();
        await buscar(q, {}, tenantMedicion);
        tiempos.push(performance.now() - inicio);
      }
      return Math.max(...tiempos);
    };
    for (const q of ['baldiviezo juana', 'quispe', '0004', '9000123']) {
      const peor = await medir(q);
      console.log(`búsqueda «${q}» con ${PERSONAS_MEDICION} personas: ${peor.toFixed(0)} ms (peor de ${REPETICIONES_MEDICION})`);
      expect(peor).toBeLessThan(LIMITE_MS);
    }
  }, 600_000);
});
