import { Writable } from 'node:stream';
import type { EventoBitacoraExportado, FiltroExportacion } from '../src/application/ports/lectura-bitacora.js';
import { EscritorBitacoraXlsx } from '../src/infrastructure/xlsx/escritor-bitacora.xlsx.js';
import { LecturaBitacoraTypeOrm } from '../src/infrastructure/typeorm/lectura-bitacora.typeorm.js';
import { crearEntorno, type Entorno } from './support/entorno.js';
import { describeConDb } from './support/temp-db.js';

const EVENTOS_EN_RANGO = 2_503;
const FILAS_MAXIMAS = 10_000;
const SEGUNDOS_MAXIMOS = 10;
const SEMANA: FiltroExportacion = { desde: '2026-10-27', hasta: '2026-11-02' };

/** Descarta lo escrito: la prueba mide la lectura y el armado del XLSX, no el disco. */
const sumidero = () => new Writable({ write: (_parte, _codificacion, listo) => listo() });

describeConDb('Exportación de la bitácora sobre PostgreSQL (spec 18b)', () => {
  let e: Entorno;
  let lectura: LecturaBitacoraTypeOrm;
  let tenantA: string;
  let tenantB: string;
  let usuarioA: string;

  const enTenant = <T>(tenantId: string, trabajo: () => Promise<T>) => e.en(tenantId, () => e.uow.run(trabajo));

  async function recorrerTodo(tenantId: string, filtro: FiltroExportacion): Promise<{ eventos: EventoBitacoraExportado[]; lotes: number }> {
    const eventos: EventoBitacoraExportado[] = [];
    let lotes = 0;
    await enTenant(tenantId, () =>
      lectura.recorrer(filtro, async (lote) => {
        lotes += 1;
        eventos.push(...lote);
      }),
    );
    return { eventos, lotes };
  }

  beforeAll(async () => {
    e = await crearEntorno();
    lectura = new LecturaBitacoraTypeOrm(e.uow, e.contexto);
    tenantA = await e.sembrar.tenant();
    tenantB = await e.sembrar.tenant();
    usuarioA = (await e.sembrar.membresia(tenantA)).usuarioId;
    // De a 7 eventos con la misma fecha al microsegundo: el keyset tiene que desempatar por id.
    await e.dataSource.query(
      `INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle, ip, ocurrido_en)
       SELECT $1, $2, 'ACCESO_DENEGADO', jsonb_build_object('permiso', 'plat.rol.gestionar'), '190.42.10.8',
              timestamptz '2026-11-02 18:00:00.123456-05' - make_interval(secs => (n / 7) * 60)
         FROM generate_series(1, $3::int) AS n`,
      [tenantA, usuarioA, EVENTOS_EN_RANGO - 3],
    );
    await e.dataSource.query(
      `INSERT INTO seg.evento_seguridad (tenant_id, usuario_id, tipo, detalle, ocurrido_en) VALUES
         ($1, $2, 'LOGIN', '{"metodo": "password"}', '2026-11-02 23:00:00-05'),
         ($1, $2, 'LOGIN_FALLIDO', '{"etapa": "CLAVE", "motivo": "BLOQUEO_INGRESO"}', '2026-11-02 23:30:00-05'),
         ($1, $2, 'EXPORTACION', '{"recurso": "bitacora", "filas": 3}', '2026-11-02 23:45:00-05'),
         ($1, $2, 'LOGIN', '{"metodo": "password"}', '2026-11-03 00:00:00-05'),
         ($3, NULL, 'LOGIN', '{"metodo": "oauth"}', '2026-11-01 12:00:00-05')`,
      [tenantA, usuarioA, tenantB],
    );
  });

  afterAll(() => e?.cerrar());

  it('cuenta lo filtrado en el rango de Lima, sin el día siguiente ni otro tenant', async () => {
    expect(await enTenant(tenantA, () => lectura.contar(SEMANA))).toBe(EVENTOS_EN_RANGO);
    expect(await enTenant(tenantA, () => lectura.contar({ ...SEMANA, tipo: 'LOGIN' }))).toBe(1);
    expect(await enTenant(tenantB, () => lectura.contar(SEMANA))).toBe(1);
  });

  it('recorre todo por lotes de 1 000, sin repetir ni saltar, en el orden de la lista', async () => {
    const { eventos, lotes } = await recorrerTodo(tenantA, SEMANA);

    expect(lotes).toBe(3);
    expect(eventos).toHaveLength(EVENTOS_EN_RANGO);
    expect(new Set(eventos.map((evento) => evento.id)).size).toBe(EVENTOS_EN_RANGO);
    const primeraPagina = await enTenant(tenantA, () => lectura.listar({ ...SEMANA, pagina: 1, tamano: 100 }));
    expect(eventos.slice(0, 100).map((evento) => evento.id)).toEqual(primeraPagina.items.map((evento) => evento.id));
    const ultimaPagina = await enTenant(tenantA, () => lectura.listar({ ...SEMANA, pagina: 26, tamano: 100 }));
    expect(eventos.slice(2_500).map((evento) => evento.id)).toEqual(ultimaPagina.items.map((evento) => evento.id));
  });

  it('resume LOGIN con el método, LOGIN_FALLIDO con el motivo y EXPORTACION con las filas, y trae la IP', async () => {
    const { eventos } = await recorrerTodo(tenantA, SEMANA);
    const resumenDe = (tipo: string) => eventos.find((evento) => evento.tipo === tipo)?.resumen;

    expect([resumenDe('LOGIN'), resumenDe('LOGIN_FALLIDO'), resumenDe('EXPORTACION')]).toEqual(['password', 'BLOQUEO_INGRESO', '3']);
    expect(eventos.find((evento) => evento.tipo === 'ACCESO_DENEGADO')).toMatchObject({ ip: '190.42.10.8', usuario: { id: usuarioA } });
  });

  it(`${FILAS_MAXIMAS} filas de la base salen en XLSX en menos de ${SEGUNDOS_MAXIMOS} s (TR-RNF-002)`, async () => {
    const tenantGrande = await e.sembrar.tenant();
    await e.dataSource.query(
      `INSERT INTO seg.evento_seguridad (tenant_id, tipo, detalle, ocurrido_en)
       SELECT $1, 'LOGIN', '{"metodo": "password"}', timestamptz '2026-11-02 18:00:00-05' - make_interval(secs => n)
         FROM generate_series(1, $2::int) AS n`,
      [tenantGrande, FILAS_MAXIMAS],
    );
    const escritor = new EscritorBitacoraXlsx(sumidero());
    let filas = 0;
    const inicio = Date.now();

    escritor.abrir();
    await enTenant(tenantGrande, () =>
      lectura.recorrer(SEMANA, async (lote) => {
        filas += lote.length;
        await escritor.escribir(lote);
      }),
    );
    await escritor.terminar();

    expect(filas).toBe(FILAS_MAXIMAS);
    expect((Date.now() - inicio) / 1000).toBeLessThan(SEGUNDOS_MAXIMOS);
  }, 60_000);
});
