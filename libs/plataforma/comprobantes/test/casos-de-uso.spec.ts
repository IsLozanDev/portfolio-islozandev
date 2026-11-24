import { AvisarCertificadosPorVencer, TAMANO_LOTE_AVISOS } from '../src/application/avisar-certificados-por-vencer.js';
import { BYTES_MAXIMOS_CERTIFICADO, CargarCertificado, type CargarCertificadoComando } from '../src/application/cargar-certificado.js';
import { ConfigurarEmisor, type ConfigurarEmisorComando } from '../src/application/configurar-emisor.js';
import { ConsultarEmisor } from '../src/application/consultar-emisor.js';
import { Emisor } from '../src/domain/emisor.js';
import {
  ActorRequeridoFeError,
  ArchivoCertificadoInvalidoError,
  CertificadoOtroRucError,
  CertificadoVencidoError,
  ClaveCertificadoIncorrectaError,
  EmisorNoEncontradoError,
  EmpresaInactivaError,
  EmpresaNoEncontradaError,
  ProveedorFeInvalidoError,
  VersionObsoletaEmisorError,
} from '../src/domain/errores.js';
import { EVENTOS_FE } from '../src/domain/eventos-fe.js';
import { bytesAleatorios, CLAVE_PFX, crearPfx, enDias, OTRO_RUC, RUC_EMPRESA, sujetoConRuc } from './support/certificados.js';
import {
  AHORA,
  crearDobles,
  crearDoblesAvisos,
  EMPRESA,
  EMPRESA_DE_B,
  EMPRESA_INACTIVA,
  SIMULADO,
  SIN_CERTIFICADO,
  TENANT_A,
  TENANT_B,
  URL_SIMULADOR,
  USUARIO,
  type Dobles,
} from './support/dobles.js';

const CLAVE_PROVEEDOR = 'clave-del-proveedor-sol';
const ahora = new Date(AHORA);

const comando = (cambios: Partial<ConfigurarEmisorComando> = {}): ConfigurarEmisorComando => ({
  empresaId: EMPRESA,
  proveedor: SIMULADO,
  usuarioProveedor: 'MODDATOS',
  clave: CLAVE_PROVEEDOR,
  regimenIgv: 'GENERAL',
  leyendaPie: 'Representación impresa',
  urlProveedor: URL_SIMULADOR,
  ...cambios,
});

const carga = (pfx: Uint8Array, clave = CLAVE_PFX): CargarCertificadoComando => ({ empresaId: EMPRESA, pfx, clave });

/** Nada de lo guardado o publicado lleva las claves ni el .pfx (TR-RNF-026). */
function sinSecretos(dobles: Dobles, ...secretos: string[]): void {
  const visible = JSON.stringify([dobles.publicador.eventos, dobles.auditoria.entradas, dobles.emisores.filas.map((fila) => fila.datos)]);
  for (const secreto of secretos) expect(visible).not.toContain(secreto);
}

describe('ConfigurarEmisor (TR-RF-052, pasos 1 y 2)', () => {
  let dobles: Dobles;
  beforeEach(() => {
    dobles = crearDobles();
  });

  it('sin emisor lo crea en BORRADOR (SIMULADO pide certificado), guarda la clave en la bóveda y audita sin ella', async () => {
    const { vista, creado } = await new ConfigurarEmisor(dobles).ejecutar(comando());

    expect(creado).toBe(true);
    expect(vista).toMatchObject({ estado: 'BORRADOR', proveedor: SIMULADO, ambiente: 'BETA', tieneCredencial: true, certificado: null, version: 1 });
    const [secreto] = [...dobles.boveda.secretos.values()];
    expect(secreto).toMatchObject({ tenantId: TENANT_A, tipo: 'fe.credencial', version: 1 });
    expect(dobles.boveda.texto(dobles.emisores.filas[0].secretoCredencialId)).toBe(CLAVE_PROVEEDOR);
    expect(dobles.auditoria.entradas).toEqual([
      expect.objectContaining({ accion: 'fe.emisor.configurar', entidadTipo: 'emisor_fe', entidadId: vista.emisorId, antes: null }),
    ]);
    expect(dobles.publicador.eventos).toEqual([]);
    sinSecretos(dobles, CLAVE_PROVEEDOR);
  });

  it('un proveedor con requiere_certificado: false queda CONFIGURADO sin certificado y publica el evento en la transacción', async () => {
    const { vista } = await new ConfigurarEmisor(dobles).ejecutar(comando({ proveedor: SIN_CERTIFICADO }));

    expect(vista.estado).toBe('CONFIGURADO');
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.emisorConfigurado]);
    expect(dobles.publicador.enTransaccion).toEqual([true]);
    expect(dobles.publicador.eventos[0].payload).toEqual({ emisor_id: vista.emisorId, empresa_id: EMPRESA, proveedor: SIN_CERTIFICADO, ambiente: 'BETA' });
  });

  it('con emisor exige la versión leída; sin clave conserva la guardada; con clave rota el mismo secreto', async () => {
    const configurar = new ConfigurarEmisor(dobles);
    const { vista: creado } = await configurar.ejecutar(comando());
    const credencialId = dobles.emisores.filas[0].secretoCredencialId;

    const { vista, creado: esNuevo } = await configurar.ejecutar(comando({ clave: undefined, usuarioProveedor: 'OTRO', version: creado.version }));
    expect([esNuevo, vista.version, vista.usuarioProveedor, vista.tieneCredencial]).toEqual([false, 2, 'OTRO', true]);
    expect(dobles.boveda.secretos.get(credencialId!)?.version).toBe(1);

    await configurar.ejecutar(comando({ clave: 'clave-nueva', version: 2 }));
    expect(dobles.emisores.filas[0].secretoCredencialId).toBe(credencialId);
    expect(dobles.boveda.secretos.size).toBe(1);
    expect(dobles.boveda.secretos.get(credencialId!)).toMatchObject({ version: 2 });
    expect(dobles.boveda.texto(credencialId)).toBe('clave-nueva');
    expect(dobles.auditoria.entradas[1]).toMatchObject({ antes: expect.objectContaining({ usuarioProveedor: 'MODDATOS' }), despues: expect.objectContaining({ usuarioProveedor: 'OTRO' }) });
    sinSecretos(dobles, CLAVE_PROVEEDOR, 'clave-nueva');
  });

  it('versión vieja, ausente con emisor o presente sin emisor → VERSION_OBSOLETA', async () => {
    const configurar = new ConfigurarEmisor(dobles);
    await expect(configurar.ejecutar(comando({ version: 1 }))).rejects.toBeInstanceOf(VersionObsoletaEmisorError);
    await configurar.ejecutar(comando());
    await expect(configurar.ejecutar(comando())).rejects.toBeInstanceOf(VersionObsoletaEmisorError);
    await expect(configurar.ejecutar(comando({ version: 7 }))).rejects.toBeInstanceOf(VersionObsoletaEmisorError);
  });

  it('si la transacción falla después de guardar en la bóveda no queda secreto, cambio, auditoría ni evento', async () => {
    const configurar = new ConfigurarEmisor(dobles);
    await configurar.ejecutar(comando({ proveedor: SIN_CERTIFICADO, clave: undefined }));
    const antes = dobles.emisores.filas[0].datos;
    // Otra operación guarda el emisor entre la lectura y la escritura.
    dobles.emisores.antesDeActualizar = () => {
      dobles.emisores.filas[0] = Emisor.reconstituir({ ...dobles.emisores.filas[0].datos, version: 9 });
    };

    await expect(configurar.ejecutar(comando({ proveedor: SIN_CERTIFICADO, version: 1 }))).rejects.toBeInstanceOf(VersionObsoletaEmisorError);
    expect(dobles.boveda.secretos.size).toBe(0);
    expect(dobles.emisores.filas[0].datos).toEqual(antes);
    expect(dobles.auditoria.entradas).toHaveLength(1);
    expect(dobles.publicador.eventos).toEqual([]);
  });

  it('empresa de otro tenant → EMPRESA_NO_ENCONTRADA; inactiva → EMPRESA_INACTIVA; proveedor fuera del catálogo → PROVEEDOR_FE_INVALIDO', async () => {
    const configurar = new ConfigurarEmisor(dobles);
    await expect(configurar.ejecutar(comando({ empresaId: EMPRESA_DE_B }))).rejects.toBeInstanceOf(EmpresaNoEncontradaError);
    await expect(configurar.ejecutar(comando({ empresaId: EMPRESA_INACTIVA }))).rejects.toBeInstanceOf(EmpresaInactivaError);
    await expect(configurar.ejecutar(comando({ proveedor: 'OTRO_PSE' }))).rejects.toBeInstanceOf(ProveedorFeInvalidoError);
    expect([dobles.boveda.secretos.size, dobles.emisores.filas.length]).toEqual([0, 0]);
  });

  it('sin usuario en el contexto → ACTOR_REQUERIDO', async () => {
    dobles.contexto.alcance = { tenantId: TENANT_A };
    await expect(new ConfigurarEmisor(dobles).ejecutar(comando())).rejects.toBeInstanceOf(ActorRequeridoFeError);
  });
});

describe('ConsultarEmisor', () => {
  it('vista sin secretos; otro tenant no la ve (404)', async () => {
    const dobles = crearDobles();
    await new ConfigurarEmisor(dobles).ejecutar(comando());
    const vista = await new ConsultarEmisor(dobles).ejecutar(EMPRESA);
    expect(Object.keys(vista).sort()).toEqual(
      [
        'ambiente',
        'certificado',
        'emisorId',
        'empresaId',
        'estado',
        'leyendaPie',
        'produccionHabilitadaEn',
        'proveedor',
        'prueba',
        'regimenIgv',
        'tieneCredencial',
        'urlProveedor',
        'usuarioProveedor',
        'version',
      ].sort(),
    );

    dobles.contexto.alcance = { tenantId: TENANT_B, actorId: USUARIO };
    await expect(new ConsultarEmisor(dobles).ejecutar(EMPRESA)).rejects.toBeInstanceOf(EmisorNoEncontradoError);
  });
});

describe('CargarCertificado (TR-RF-052, paso 3)', () => {
  let dobles: Dobles;
  const pfxVigente = crearPfx(ahora);

  beforeEach(async () => {
    dobles = crearDobles();
    await new ConfigurarEmisor(dobles).ejecutar(comando());
  });

  it('TR-CA-133: con un .pfx vigente del RUC queda CONFIGURADO, guarda .pfx y clave en la bóveda y publica una vez', async () => {
    const vista = await new CargarCertificado(dobles).ejecutar(carga(pfxVigente));

    expect(vista.estado).toBe('CONFIGURADO');
    expect(vista.certificado).toMatchObject({ ruc: RUC_EMPRESA, huellaSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const fila = dobles.emisores.filas[0].datos;
    expect(dobles.boveda.secretos.get(fila.secretoCertificadoId!)).toMatchObject({ tipo: 'fe.certificado', valor: pfxVigente });
    expect(dobles.boveda.texto(fila.secretoClaveCertificadoId)).toBe(CLAVE_PFX);
    expect(dobles.boveda.secretos.get(fila.secretoClaveCertificadoId!)?.tipo).toBe('fe.clave_certificado');
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.emisorConfigurado]);
    expect(dobles.auditoria.entradas[1]).toMatchObject({
      accion: 'fe.emisor.cargar_certificado',
      antes: null,
      despues: { ruc: RUC_EMPRESA, huellaSha256: vista.certificado?.huellaSha256 },
    });

    // Otra carga del mismo certificado no vuelve a publicar: ya estaba CONFIGURADO.
    await new CargarCertificado(dobles).ejecutar(carga(pfxVigente));
    expect(dobles.publicador.tipos()).toEqual([EVENTOS_FE.emisorConfigurado]);
    sinSecretos(dobles, CLAVE_PROVEEDOR, CLAVE_PFX, Buffer.from(pfxVigente).toString('base64').slice(0, 40));
  });

  it('reemplazar el certificado rota los mismos dos secretos (misma id, versión + 1)', async () => {
    const cargar = new CargarCertificado(dobles);
    await cargar.ejecutar(carga(pfxVigente));
    const { secretoCertificadoId, secretoClaveCertificadoId } = dobles.emisores.filas[0].datos;
    const nuevo = crearPfx(ahora, { clave: 'otra-clave-pfx' });

    await cargar.ejecutar(carga(nuevo, 'otra-clave-pfx'));
    const fila = dobles.emisores.filas[0].datos;
    expect([fila.secretoCertificadoId, fila.secretoClaveCertificadoId]).toEqual([secretoCertificadoId, secretoClaveCertificadoId]);
    expect(dobles.boveda.secretos.get(secretoCertificadoId!)).toMatchObject({ version: 2, valor: nuevo });
    expect(dobles.boveda.secretos.size).toBe(3);
  });

  it('TR-CA-134: un .pfx de otro RUC → CERTIFICADO_OTRO_RUC; el emisor y la bóveda no cambian', async () => {
    const antes = dobles.emisores.filas[0].datos;
    const pfx = crearPfx(ahora, { sujeto: sujetoConRuc(OTRO_RUC) });

    await expect(new CargarCertificado(dobles).ejecutar(carga(pfx))).rejects.toThrow(
      new CertificadoOtroRucError(),
    );
    expect(dobles.emisores.filas[0].datos).toEqual(antes);
    expect(dobles.boveda.secretos.size).toBe(1);
  });

  it('vencido, clave incorrecta, archivo que no es PKCS#12 o de más de 50 KB', async () => {
    const cargar = new CargarCertificado(dobles);
    const vencido = crearPfx(ahora, { emitidoEn: enDias(ahora, -400), venceEn: enDias(ahora, -1) });
    await expect(cargar.ejecutar(carga(vencido))).rejects.toBeInstanceOf(CertificadoVencidoError);
    await expect(cargar.ejecutar(carga(pfxVigente, 'mala'))).rejects.toBeInstanceOf(ClaveCertificadoIncorrectaError);
    await expect(cargar.ejecutar(carga(bytesAleatorios(100)))).rejects.toBeInstanceOf(ArchivoCertificadoInvalidoError);
    await expect(cargar.ejecutar(carga(bytesAleatorios(BYTES_MAXIMOS_CERTIFICADO + 1)))).rejects.toBeInstanceOf(
      ArchivoCertificadoInvalidoError,
    );
    expect(dobles.boveda.secretos.size).toBe(1);
  });

  it('sin emisor → EMISOR_NO_ENCONTRADO (primero se configura el proveedor)', async () => {
    const otros = crearDobles();
    await expect(new CargarCertificado(otros).ejecutar(carga(pfxVigente))).rejects.toBeInstanceOf(
      EmisorNoEncontradoError,
    );
  });
});

describe('AvisarCertificadosPorVencer (TR-CA-135)', () => {
  const VENCE = new Date('2026-11-05T05:00:00.000Z');
  let dobles: Dobles;

  async function emisorConCertificado(venceEn: Date): Promise<void> {
    dobles.reloj.instante = new Date('2026-09-01T15:00:00.000Z');
    await new ConfigurarEmisor(dobles).ejecutar(comando());
    const pfx = crearPfx(dobles.reloj.now(), { emitidoEn: new Date('2026-01-01T00:00:00Z'), venceEn });
    await new CargarCertificado(dobles).ejecutar(carga(pfx));
  }

  beforeEach(() => {
    dobles = crearDobles();
  });

  it('el 2026-10-06 publica con dias_restantes = 30; otra corrida ese día o después no repite; un certificado nuevo vuelve a avisar', async () => {
    await emisorConCertificado(VENCE);
    const avisos = crearDoblesAvisos(dobles);
    const tarea = new AvisarCertificadosPorVencer(avisos);
    dobles.publicador.eventos.length = 0;

    expect(await tarea.ejecutar('2026-10-05')).toEqual({ revisados: 1, avisados: 0, fallidos: 0 });
    expect(await tarea.ejecutar('2026-10-06')).toEqual({ revisados: 1, avisados: 1, fallidos: 0 });
    const [evento] = dobles.publicador.eventos;
    expect(evento.eventType).toBe(EVENTOS_FE.certificadoPorVencer);
    expect(evento.payload).toEqual({
      emisor_id: dobles.emisores.filas[0].id,
      empresa_id: EMPRESA,
      ruc: RUC_EMPRESA,
      vence_en: expect.stringMatching(/^2026-11-05T05:00:00/),
      dias_restantes: 30,
    });
    expect(avisos.avisos.avisos[0]).toMatchObject({ tenantId: TENANT_A, diasAntes: 30, fechaEjecucion: '2026-10-06' });

    expect(await tarea.ejecutar('2026-10-06')).toEqual({ revisados: 0, avisados: 0, fallidos: 0 });
    expect(await tarea.ejecutar('2026-10-20')).toEqual({ revisados: 0, avisados: 0, fallidos: 0 });
    expect(dobles.publicador.eventos).toHaveLength(1);

    dobles.reloj.instante = new Date('2026-10-20T15:00:00.000Z');
    const nuevo = crearPfx(dobles.reloj.now(), { emitidoEn: new Date('2026-10-01T00:00:00Z'), venceEn: new Date('2026-11-10T05:00:00.000Z') });
    await new CargarCertificado(dobles).ejecutar(carga(nuevo));
    expect(await tarea.ejecutar('2026-10-20')).toEqual({ revisados: 1, avisados: 1, fallidos: 0 });
    expect(dobles.publicador.eventos.at(-1)?.payload).toMatchObject({ dias_restantes: 21 });
  });

  it('cada tenant decide con su parámetro y corre en su contexto', async () => {
    await emisorConCertificado(VENCE);
    const avisos = crearDoblesAvisos(dobles);
    avisos.diasPorTenant.set(TENANT_A, 10);
    expect(await new AvisarCertificadosPorVencer(avisos).ejecutar('2026-10-06')).toEqual({ revisados: 1, avisados: 0, fallidos: 0 });
    expect(await new AvisarCertificadosPorVencer(avisos).ejecutar('2026-10-26')).toEqual({ revisados: 1, avisados: 1, fallidos: 0 });
  });

  it('si un emisor falla, lo registra sin detalle y sigue', async () => {
    await emisorConCertificado(VENCE);
    const avisos = crearDoblesAvisos(dobles);
    avisos.diasAviso = { delTenant: () => Promise.reject(new TypeError('cfg caído')) };
    expect(await new AvisarCertificadosPorVencer(avisos).ejecutar('2026-10-06')).toEqual({ revisados: 1, avisados: 0, fallidos: 1 });
    expect(avisos.registros[0]).toMatchObject({ nivel: 'avisar', datos: { error: 'TypeError' } });
  });

  it('recorre en lotes por id: un lote lleno de certificados que aún no tocan aviso no deja fuera a los siguientes', async () => {
    const avisos = crearDoblesAvisos(dobles);
    for (let indice = 0; indice <= TAMANO_LOTE_AVISOS; indice += 1) {
      const lejano = indice < TAMANO_LOTE_AVISOS;
      dobles.emisores.filas.push(
        Emisor.reconstituir({
          ...Emisor.crear({ id: `e${String(indice).padStart(4, '0')}`, tenantId: TENANT_A, empresaId: `empresa-${indice}`, creadoPor: USUARIO, ahora }).datos,
          certificado: { ruc: RUC_EMPRESA, venceEn: lejano ? new Date('2026-12-20T05:00:00Z') : VENCE, huellaSha256: String(indice).padStart(64, '0') },
          secretoCertificadoId: 's',
          secretoClaveCertificadoId: 'c',
        }),
      );
    }
    expect(await new AvisarCertificadosPorVencer(avisos).ejecutar('2026-10-06')).toEqual({ revisados: TAMANO_LOTE_AVISOS + 1, avisados: 1, fallidos: 0 });
  });
});
