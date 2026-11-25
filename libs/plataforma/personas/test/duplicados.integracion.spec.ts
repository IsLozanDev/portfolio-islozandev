import { AlsTenantContext, TypeOrmUnitOfWork, uuidV7 } from '@vitrina/plataforma/kernel-infra';
import { DataSource } from 'typeorm';
import type { CriteriosDuplicados } from '../src/application/ports/consulta-duplicados.js';
import { Contacto } from '../src/domain/contacto.js';
import { DocumentoIdentidad, type TipoDocumentoPersona } from '../src/domain/documento-identidad.js';
import { ParPersonas, PUNTAJE_MINIMO } from '../src/domain/duplicados.js';
import { Persona, type TipoPersona } from '../src/domain/persona.js';
import { ConsultaDuplicadosTypeOrm } from '../src/infrastructure/typeorm/consulta-duplicados.typeorm.js';
import { ENTIDADES_PER } from '../src/infrastructure/typeorm/entidades.js';
import { RepositorioPersonasTypeOrm } from '../src/infrastructure/typeorm/personas.repositorio.js';
import { createTempDb, describeConDb, type TempDb } from './support/temp-db.js';

interface Semilla {
  tipoPersona?: TipoPersona;
  tipoDocumento: TipoDocumentoPersona;
  numero: string;
  nombres?: string;
  paterno?: string;
  materno?: string;
  razonSocial?: string;
  celular: string;
}

const natural = (tipoDocumento: TipoDocumentoPersona, numero: string, nombre: [string, string, string?], celular: string): Semilla => ({
  tipoDocumento,
  numero,
  nombres: nombre[0],
  paterno: nombre[1],
  materno: nombre[2],
  celular,
});

// TR-CA-107 con documento obligatorio: DNI y pasaporte, mismo celular, un nombre contenido en el otro (60).
const JUANA_DNI = natural('DNI', '45781236', ['Juana', 'Quispe', 'Mamani'], '987654321');
const JUANA_PASAPORTE = natural('PASAPORTE', 'P1234567', ['Juana', 'Quispe'], '987654321');
// Mismo número con distinto tipo (100).
const MARTHA_CE = natural('CE', '002345671', ['Martha', 'Jiménez', 'Llerena'], '965432187');
const MARTHA_PASAPORTE = natural('PASAPORTE', '002345671', ['Martha', 'Jimenez'], '965000111');
// Mismo celular y nombre normalizado igual (80).
const CARLOS_DNI = natural('DNI', '71234560', ['Carlos', 'Huamán', 'Ccori'], '912345678');
const CARLOS_CE = natural('CE', '001234567', ['CARLOS', 'Huaman', 'Ccori'], '912345678');
// Mismo celular y misma clave fonética (60).
const ROSA_DNI = natural('DNI', '40236718', ['Rosa', 'Valdivieso'], '956112430');
const ROSA_CE = natural('CE', '003336718', ['Rosa', 'Baldiviezo'], '956112430');
// TR-CA-108: DNI distintos con el mismo nombre y celular, bloqueados.
const PEDRO_DNI = natural('DNI', '45781237', ['Pedro', 'Condori'], '911111111');
const PEDRO_OTRO_DNI = natural('DNI', '45781238', ['Pedro', 'Condori'], '911111111');
// Jurídica con el celular de Juana: otro tipo de persona, nunca es par.
const JUANA_EIRL: Semilla = {
  tipoPersona: 'JURIDICA',
  tipoDocumento: 'RUC',
  numero: '20601234565',
  razonSocial: 'Juana Quispe E.I.R.L.',
  celular: '987654321',
};
// Ya fusionada en Juana: no se propone.
const JUANA_ALIAS = natural('CE', '009876543', ['Juana', 'Quispe'], '987654321');

describeConDb('Duplicados de personas con TypeORM (spec 39, PostgreSQL 16)', () => {
  let baseTemporal: TempDb;
  let dataSource: DataSource;
  let contexto: AlsTenantContext;
  let unidadDeTrabajo: TypeOrmUnitOfWork;
  let repositorio: RepositorioPersonasTypeOrm;
  let consulta: ConsultaDuplicadosTypeOrm;
  const tenantA = uuidV7();
  const tenantB = uuidV7();
  const ids = new Map<Semilla, string>();
  const id = (semilla: Semilla) => ids.get(semilla) ?? '';
  const par = (una: Semilla, otra: Semilla) => ParPersonas.de(id(una), id(otra));

  const enTenant = <Resultado>(tenantId: string, trabajo: () => Promise<Resultado>): Promise<Resultado> =>
    contexto.run({ tenantId }, () => unidadDeTrabajo.run(trabajo));

  async function sembrar(tenantId: string, semilla: Semilla): Promise<string> {
    const persona = Persona.registrar({
      id: uuidV7(),
      tenantId,
      tipoPersona: semilla.tipoPersona ?? 'NATURAL',
      documento: DocumentoIdentidad.crear(semilla.tipoDocumento, semilla.numero),
      nombres: semilla.nombres,
      apellidoPaterno: semilla.paterno,
      apellidoMaterno: semilla.materno,
      razonSocial: semilla.razonSocial,
      contactos: [Contacto.crear({ id: uuidV7(), tipo: 'CELULAR', valor: semilla.celular, principal: true })],
    });
    await enTenant(tenantId, () => repositorio.guardar(persona));
    return persona.id;
  }

  const buscar = (criterios: Partial<CriteriosDuplicados> = {}, tenantId = tenantA) =>
    enTenant(tenantId, () => consulta.buscar({ pagina: 1, tamano: 20, puntajeMinimo: PUNTAJE_MINIMO, ...criterios }));

  const paresDe = async (criterios: Partial<CriteriosDuplicados> = {}) =>
    (await buscar(criterios)).items.map((item) => ({ par: ParPersonas.de(item.personaA.id, item.personaB.id), puntaje: item.puntaje }));

  beforeAll(async () => {
    baseTemporal = await createTempDb();
    dataSource = new DataSource({ type: 'postgres', url: baseTemporal.url, entities: ENTIDADES_PER });
    await dataSource.initialize();
    contexto = new AlsTenantContext();
    unidadDeTrabajo = new TypeOrmUnitOfWork(dataSource, contexto);
    repositorio = new RepositorioPersonasTypeOrm(unidadDeTrabajo, contexto);
    consulta = new ConsultaDuplicadosTypeOrm(unidadDeTrabajo, contexto);
    const semillas = [
      JUANA_DNI, JUANA_PASAPORTE, MARTHA_CE, MARTHA_PASAPORTE, CARLOS_DNI, CARLOS_CE,
      ROSA_DNI, ROSA_CE, PEDRO_DNI, PEDRO_OTRO_DNI, JUANA_EIRL, JUANA_ALIAS,
    ];
    for (const semilla of semillas) ids.set(semilla, await sembrar(tenantA, semilla));
    await enTenant(tenantA, () =>
      unidadDeTrabajo.manager.query(
        `UPDATE per.persona SET activo = false, fusionada_en_id = $1, fusionada_en = now() WHERE id = $2`,
        [id(JUANA_DNI), id(JUANA_ALIAS)],
      ),
    );
    // La misma Juana con pasaporte en otro tenant: nunca forma par con las de A.
    await sembrar(tenantB, JUANA_PASAPORTE);
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await baseTemporal?.drop();
  });

  it('propone los pares por puntaje con sus motivos y excluye bloqueados, otro tipo de persona, fusionadas y otro tenant', async () => {
    const pagina = await buscar();

    expect(pagina.total).toBe(4);
    expect(pagina.items.map((item) => ({ par: ParPersonas.de(item.personaA.id, item.personaB.id), puntaje: item.puntaje, motivos: item.motivos })))
      .toEqual([
        { par: par(MARTHA_CE, MARTHA_PASAPORTE), puntaje: 100, motivos: ['MISMO_NUMERO_OTRO_TIPO'] },
        { par: par(CARLOS_DNI, CARLOS_CE), puntaje: 80, motivos: ['CELULAR_Y_NOMBRE_IGUAL', 'CELULAR_Y_NOMBRE_PARECIDO'] },
        expect.objectContaining({ puntaje: 60, motivos: ['CELULAR_Y_NOMBRE_PARECIDO'] }),
        expect.objectContaining({ puntaje: 60, motivos: ['CELULAR_Y_NOMBRE_PARECIDO'] }),
      ]);
    expect(pagina.items.slice(2).map((item) => ParPersonas.de(item.personaA.id, item.personaB.id))).toEqual(
      expect.arrayContaining([par(JUANA_DNI, JUANA_PASAPORTE), par(ROSA_DNI, ROSA_CE)]),
    );
  });

  it('TR-CA-107: Juana con DNI y Juana con pasaporte forman par de 60 con los datos de la lista', async () => {
    const juana = (await buscar()).items.find((item) => [item.personaA.id, item.personaB.id].includes(id(JUANA_DNI)));

    expect(juana).toMatchObject({ puntaje: 60, motivos: ['CELULAR_Y_NOMBRE_PARECIDO'] });
    const conDni = [juana?.personaA, juana?.personaB].find((persona) => persona?.tipoDocumento === 'DNI');
    expect(conDni).toMatchObject({ numeroDocumento: '45781236', apellidoMaterno: 'Mamani', celularPrincipal: '987654321', roles: [] });
    expect(juana && juana.personaA.id < juana.personaB.id).toBe(true);
  });

  it('pagina con total y una página vacía más allá de la última conserva el total', async () => {
    expect(await paresDe({ tamano: 2, pagina: 2 })).toHaveLength(2);
    expect(await buscar({ tamano: 2, pagina: 3 })).toEqual({ items: [], total: 4 });
    expect((await buscar({ puntajeMinimo: 80 })).total).toBe(2);
  });

  it('un par descartado sale de la lista y vuelve al quitar el descarte', async () => {
    const martha = par(MARTHA_CE, MARTHA_PASAPORTE);
    const descartar = `INSERT INTO per.par_descartado (tenant_id, persona_menor_id, persona_mayor_id, descartado_por) VALUES ($1, $2, $3, $4)`;
    await enTenant(tenantA, () => unidadDeTrabajo.manager.query(descartar, [tenantA, martha.menor, martha.mayor, uuidV7()]));

    expect((await paresDe()).map((item) => item.par)).not.toContainEqual(martha);

    await enTenant(tenantA, () =>
      unidadDeTrabajo.manager.query(`DELETE FROM per.par_descartado WHERE tenant_id = $1`, [tenantA]),
    );
    expect((await paresDe()).map((item) => item.par)).toContainEqual(martha);
  });

  it('evaluar informa el par aunque esté bloqueado o fusionado, y nulo si no cumple ninguna regla', async () => {
    const evaluar = (unPar: ParPersonas) => enTenant(tenantA, () => consulta.evaluar(unPar));

    expect(await evaluar(par(PEDRO_DNI, PEDRO_OTRO_DNI))).toEqual({ puntaje: 80, motivos: ['CELULAR_Y_NOMBRE_IGUAL', 'CELULAR_Y_NOMBRE_PARECIDO'] });
    expect(await evaluar(par(JUANA_DNI, JUANA_ALIAS))).toEqual({ puntaje: 60, motivos: ['CELULAR_Y_NOMBRE_PARECIDO'] });
    expect(await evaluar(par(JUANA_DNI, MARTHA_CE))).toBeNull();
  });

  it('desde otro tenant no se ve ningún par de A ni se evalúan sus personas', async () => {
    expect(await buscar({}, tenantB)).toEqual({ items: [], total: 0 });
    expect(await enTenant(tenantB, () => consulta.evaluar(par(MARTHA_CE, MARTHA_PASAPORTE)))).toBeNull();
  });
});
